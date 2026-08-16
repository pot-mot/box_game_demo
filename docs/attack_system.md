# 攻击系统文档（武器阶段 / 连招 / 动画 / 中断）

## 一、整体架构

攻击系统由三层协作完成一次武器攻击的完整生命周期：

```
武器配置层（character/weapon/ + character/combat/）
  └─ MeleeSkillConfig / RangedSkillConfig
       ├─ duration: 动作时间（不含恢复）
       ├─ recovery: 恢复时间（后摇，0 = 无恢复段）
       ├─ cooldown: 冷却时间（普通攻击 = 0；非 0 时从触发时刻计时，只挡起手）
       ├─ phases: AttackPhase[]    ← 阶段序列
       └─ comboChain?: string[]    ← 连招链

角色状态机层（character/state_machine/）
  └─ attacking  meta-state（阶段调度器）
       └─ 按 phase 名查找 STATE_HANDLERS["attacking_{skillId}_{phaseName}"]
            ├─ 找到 → 委托 enter/update/exit
            └─ 未找到 → 默认阶段行为（按 moveSpeedMultiplier 减速等）

动画表现层（entity/character/appearance/）
  └─ ANIMATION_HANDLERS["attacking_{skillId}_{phaseName}"]
       ├─ 找到 → 调用阶段专用 AnimationHandler
       └─ 未找到 → 回退 ANIMATION_HANDLERS["attacking"]
```

**关键**：攻击子状态和动画处理器均按 `attacking_{skillId}_{phaseName}` 命名约定 1:1 配对，通过强类型模板字面量推导和判别式 Map 访问实现类型安全。

---

## 二、攻击阶段数据模型

### 2.1 阶段类型定义

**文件**：`src/character/combat/attack_phases.ts`（新增）

```ts
/** 攻击阶段名（运行时通过武器预设组合确定实际状态名） */
export const ATTACK_PHASES = ['windup', 'strike', 'recovery', 'spin', 'draw', 'aim', 'release'] as const
export type AttackPhaseName = typeof ATTACK_PHASES[number]

/** 阶段缓动类型 */
export const EASING_TYPES = ['ease_in_out', 'ease_out', 'linear'] as const
export type EasingType = typeof EASING_TYPES[number]

/** 攻击阶段配置 */
export interface AttackPhase {
    /** 阶段名，构成状态名 "attacking_{skillId}_{name}" */
    readonly name: AttackPhaseName
    /** 占动作时间的比例（0-1），动作阶段（非 recovery）比例之和应为 1；
     *  recovery 阶段不参与分摊，时长直接取 config.recovery */
    readonly durationRatio: number
    /** 移速倍率：0 = 完全定身，1 = 全速移动 */
    readonly moveSpeedMultiplier: number
    /** 是否可被 combo 输入 / dash / jump 打断 */
    readonly cancellable: boolean
    /** 动画参数 */
    readonly animConfig: AttackAnimConfig
}

/** 阶段动画参数 */
export interface AttackAnimConfig {
    /** 手臂从后到前的肩部 X 轴摆幅（蓄力时终值、打击时起值） */
    readonly armSwingBackX: number
    /** 手臂横向分量（Z 轴，用于水平斩 / 垂直砍分解） */
    readonly armSwingBackZ: number
    /** 打击时肩部 X 轴最终值 */
    readonly armSwingForwardX: number
    /** 肘部弯曲幅度 */
    readonly elbowBend: number
    /** 躯干前倾角 */
    readonly bodyLean: number
    /** 双手持握（左手镜像右手） */
    readonly twoHanded: boolean
    /** 缓动曲线 */
    readonly easing: EasingType
}
```

### 2.2 阶段解析

```ts
/** 根据阶段名查找已注册的阶段特定 StateHandler，未找到则返回 attackingHandler 回退 */
const resolvePhaseHandler = (skillId: string, phaseName: AttackPhaseName): StateHandler => {
    const key = `attacking_${skillId}_${phaseName}` as const
    return STATE_HANDLERS[key] ?? STATE_HANDLERS['attacking']
}
```

### 2.3 时间模型（三计时属性）

技能计时器由三个属性表达：**动作时间 `duration` + 恢复时间 `recovery` + 冷却时间 `cooldown`**。技能总时长 = `duration + recovery`；普通攻击（近战链段 / 远程预设）`cooldown = 0`，节奏完全由动作/恢复时间形成；冷却机制保留给特殊技能（如蓄力，见 test_weapon），非 0 时从**触发时刻**开始计时、只挡起手。

单阶段时长由 `phaseDurationOf(phase, duration, recovery)` 计算：

```ts
/* recovery 阶段取 config.recovery；其余动作阶段按 durationRatio 从 config.duration 分摊 */
export const phaseDurationOf = (phase: AttackPhase, duration: number, recovery: number): number =>
    phase.name === 'recovery' ? recovery : duration * phase.durationRatio
```

```
近战轻段：duration = 0.2s，recovery = 0.2s，总时长 0.4s
├─ strike:   durationRatio = 1 → 实际时长 0.2s（= duration）
└─ recovery: durationRatio = 0 → 实际时长 0.2s（= config.recovery，ratio 不参与）

每个阶段内的 phaseProgress = phaseTimer / phaseDurationOf(...)
总进度 totalProgress = attackTimer / (duration + recovery)
```

**未定义 phases 时**自动生成单阶段回退：`[{name: "strike", durationRatio: 1, moveSpeedMultiplier: 0.3, cancellable: false}]`，行为与重构前完全一致。

---

## 三、连段系统（链段即技能 + 输入缓冲）

### 3.1 通用连段机制（近战 / 远程共用）

连段不绑定特定武器结构：每个技能槽通过 `SkillSlot.comboChain` 声明"本段之后可接的技能"，attacking meta-state 的段末缓冲推进（见 3.4）按链消费。**武器的连段由该武器自己的技能槽集合与 `comboChain` 拓扑定义**——段数、段结构、是否循环完全由武器预设决定，不同武器可以不同（可以是 2 段、3 段，也可以不挂链 = 单次攻击）。近战与远程共用同一套机制，远程技能同样可以定义 `comboChain` 组连段（如多段射击 / 蓄力-释放序列）。

```ts
export interface SkillSlot {
    readonly config: SkillConfig
    cooldownTimer: number
    /** 连招链：本段后可接的技能 ID 列表（可循环） */
    comboChain?: readonly string[]
    /** 链起手槽标记：切链时更新 chainEntryIndex；冷却非 0 的技能触发时挂冷却（普通攻击冷却恒 0） */
    isChainEntry?: boolean
    /** 触发守卫（可选）：起手/链下一段的触发条件（蓄力、方向组合键等）；无守卫 = 无条件通过，作为兜底应放在同类候选末尾 */
    readonly triggerGuard?: ComboGuard
    /** 起手槽归属的攻击键组（0 = 轻击键 / 1 = 重击键）；默认 = 槽自身索引 */
    readonly entryGroup?: number
}
```

通用约定（与段数无关）：

- 起手槽标 `isChainEntry`；`comboChain` 指向链中下一段，可构成循环链（持续输入无限循环）。
- 普通攻击（近战链段 / 远程预设）`cooldown = 0`：节奏由动作时间 + 恢复时间自然形成，链推进无冷却阻塞。冷却机制保留给特殊技能（如蓄力攻击），非 0 时从该段**触发时刻**开始计时（起手 enter 与段末推进均立即挂自身冷却）、只挡起手。
- 段配置（动作时间 / 恢复时间 / 阶段 / 动作 / 伤害）由武器预设自行定义。

### 3.2 近战当前预设：短剑 4 槽双链（示例）

**近战模块**当前所有武器由 `buildMeleeSkillSlots(weaponId, overrides)` 装配，暂统一沿用短剑精调的 4 槽双链结构（`MELEE_CHAIN_SLOTS`），其余武器的段节奏/幅度后续逐一修正为各自的结构——**下表是短剑示例，不是对所有武器的要求**：

| 槽 | 链段 id | 动作（短剑基准） | strike 时长 | recovery | swingTilt |
|---|---|---|---|---|---|
| 0 | `{weapon}_light_1` | 上至下竖劈 | 0.2s | 0.2s | 0（竖劈） |
| 1 | `{weapon}_heavy_1` | 水平横向挥砍 | 0.3s | 0.2s | ≈π/2（左向横斩） |
| 2 | `{weapon}_light_2` | 水平向前戳 | 0.2s | 0.2s | —（thrust 不受倾斜角影响） |
| 3 | `{weapon}_heavy_2` | 斜向挥砍 | 0.3s | 0.2s | ≈-π/4（右向斜劈） |

- 槽 0 = 轻击键起手、槽 1 = 重击键起手；轻1↔轻2、重1↔重2 各自成循环链。
- 段时长（轻 = 动作 0.2s + 恢复 0.2s、重 = 动作 0.3s + 恢复 0.2s）、重段伤害倍率（×1.6）目前是短剑基准的全局常量；普通攻击冷却全为 0；武器独立连段化时应改为按武器配置。
- `MeleeSkillConfig.swingTilt`：段固有挥砍倾斜角（确定性，非随机轮转），`attacking.enter` 与段末推进时写入 `c.swingTilt`。
- 武器间差异目前体现在 `MELEE_CHAIN_STYLES`（幅度系数 / 双手持握），结构差异待后续展开。

### 3.3 远程模块

远程技能同样走 `SkillSlot` + `comboChain` 通用机制，`RangedSkillConfig` 支持 `phases`（draw / aim / release）与 `comboChain` 字段。当前远程预设均为单槽技能（未挂链），行为即普通单次攻击；如需为某远程武器组连段（如三连射、蓄力-释放两段），只需在其技能槽上声明 `comboChain`，段末缓冲推进逻辑无需任何改动。

### 3.4 连段守卫（触发条件：蓄力 / 方向组合键）

**文件**：`src/character/combat/combo_guard.ts`

守卫决定"首段（起手）与链下一段何时可触发"，典型场景：同键点按 vs 长按（蓄力攻击）、攻击 + 方向组合键触发不同变体。

```ts
/** 守卫上下文：触发瞬间的输入快照（纯数据，combat 层不依赖状态机） */
export interface ComboGuardContext {
    readonly dx: number          /* 移动方向输入 */
    readonly dz: number
    readonly holdDuration: number /* 攻击键按住时长（秒），区分点按/长按 */
}
export type ComboGuard = (ctx: ComboGuardContext) => boolean

/* 常用守卫 */
holdAtLeast(seconds)   /* 长按（蓄力） */
holdLessThan(seconds)  /* 点按 */
hasMoveInput           /* 有方向输入（攻击 + 方向组合键） */
noMoveInput            /* 无方向输入 */
```

**键组模型**：`input.skillIndex` 语义为攻击键组号（0 = 轻击键、1 = 重击键），起手槽通过 `entryGroup` 映射到键组（默认 = 槽自身索引，兼容既有武器槽 0/1 即键位）。解析规则：

- **起手选择 `resolveEntrySkillIndex(c, reqKey, ctx)`**：键组 = reqKey 的 `isChainEntry` 槽按**声明顺序**取第一个冷却完毕且守卫通过的；兜底分支处理非起手槽（远程单槽技能按冷却 + 守卫直接释放）；无候选 → -1（idle/walking 的 attacking 转换 guard 与 `setPlayerAttack` 均用它判定）。
- **链下一段 `resolveChainNextIndex(c, ctx)`**：当前段 `comboChain` 候选按声明顺序取第一个守卫通过的（不查冷却，链内推进免冷却）。
- **声明顺序 = 优先级**：带守卫的条件变体必须声明在同组兜底槽（无守卫）之前；变体冷却中会自动回退到兜底槽（两者冷却相互独立）。

**蓄力攻击（按住计时，松开判定）**：计时在输入侧完成，状态机无计时器——

1. `modes/play/camera.ts`：攻击键 mousedown 记录 `performance.now()`，mouseup 时算出按住秒数随回调传出（右键重击同为松开触发；blur/contextmenu 取消）；
2. `world.ts setPlayerAttack(idx, holdDuration)`：把按住时长存入脉冲，经 `setInput` 第 7 参喂入 `CharacterInput.attackHoldDuration`，帧末与脉冲一同归零；
3. 守卫 `holdAtLeast(阈值)` 通过则起手蓄力段，否则落到同键组兜底槽（点按段）。

**测试武器 `test_weapon`**（`src/character/combat/test_weapon.ts`，仅供单元测试，不进 `MELEE_WEAPON_PRESETS`）：6 槽覆盖蓄力起手（charge，holdAtLeast 0.5s）、点按兜底（tap）、键组分离（heavy 链 entryGroup 1）、方向变体（thrust 守卫 hasMoveInput vs 兜底 light_2）、循环链（tap↔light_2、heavy_1↔heavy_2）与无链单发（charge）。**冷却保留非 0 值作为冷却机制验证夹具**（普通攻击预设冷却均为 0）。装配入口：`world.ts` `attackToSkillSlots` 对 `weaponId === TEST_WEAPON_ID` 特判 `buildTestWeaponSkillSlots()`。

### 3.5 输入缓冲连段（段末推进）

`CombatComponent` 运行时状态：

```ts
/** 本次起链的起手槽索引（决定当前链键组） */
chainEntryIndex: number
/** 缓冲的目标技能槽索引（-1 = 无缓冲） */
bufferedSkillIndex: number
```

推进流程（`attackingHandler.update`）：

```
attacking update(dt):
  ├─ 阶段照常推进（strike → recovery）
  ├─ input.attack 为真 → resolveBufferedSkillIndex(c, input.skillIndex, ctx) 写缓冲：
  │    ├─ 请求键组 == 当前链键组（chainGroupOf）→ 续链：resolveChainNextIndex 按守卫取链下一段（免冷却）
  │    ├─ 异键组 → 切链：resolveEntrySkillIndex 解析该键组起手槽（守卫 + 冷却），不切自身
  │    └─ 其余 → 不缓冲（新输入逐帧覆写旧缓冲 = 中途改键/改方向切链换变体）
  ├─ 最终阶段（recovery）完整播完 && 缓冲存在
  │    → 切换到目标槽：重置 attackTimer/phaseIndex/phaseTimer/attackedTargets，
  │      取新段 swingTilt，新段触发即挂自身冷却（普通攻击冷却 = 0 不挂；特殊技能循环链回到起手槽 = 刷新冷却），
  │      **不出 attacking 状态**（链内推进不检查冷却）
  └─ 无缓冲 → 播完后正常走 transition 退出（冷却已在各段触发时挂上，exit 不补挂）
```

**玩家侧**：`world.ts` `setPlayerAttack(idx, holdDuration)` 攻击中不再拒绝，写单帧脉冲（含按住时长）经 `input.attack + skillIndex + attackHoldDuration` 由上述解析消费；非攻击中改用 `resolveEntrySkillIndex` 判定（键组内守卫变体与兜底槽冷却独立，不能只查单槽冷却）。**HUD 展示**：`modes/play/player_hud.ts` 每技能槽一行，同行展示动作/恢复/冷却三个计时器（`SkillTimerRowData`，数据由 `modes/play/index.ts` 按 `attackTimer` 与 `cooldownTimer` 装配）。**AI 侧**：`attack` 状态持续 `setInput(..., attack=true, ..., 0)` → 缓冲恒有值，自动无限走轻链，无需感知链结构（AI 不蓄力，holdDuration 恒 0 → 命中兜底槽）。

### 3.6 确定性挥砍方向

旧版 `COMBO_TILT_TABLE` 按挥砍次数轮转倾斜角（起手方向取决于历史，表现为“随机挥出”）已删除；每段方向的唯一来源是预设的 `swingTilt`，同段每次播放方向一致。

### 3.7 移动技能：冲刺（dash）

冲刺已整合进技能系统的三计时模型（`src/character/combat/dash_skill.ts`）：`DashSkillConfig`（id `dash`，duration = 0.25s 动作时间 / recovery = 0 / cooldown = 1.0s）经 `createDashSkillSlot()` 挂在 `CombatComponent.dashSkill`（`SkillSlot<DashSkillConfig>`，独立于攻击技能列表 `skills`，不参与起手解析/连段链/执行器）。运行时语义与攻击技能一致：

- **冷却挡起手**：idle/walking/jumping/falling/attacking 的 `→ dashing` 转换守卫读 `combat.dashSkill.cooldownTimer <= 0`；`dashing.enter` 触发即挂 `config.cooldown`，由 `world.ts` 与攻击技能同循环递减。
- **类型形态**：`SkillSlot<C extends SkillTimingConfig = SkillConfig>` 泛型默认攻击技能联合（近战/远程），冲刺槽用窄化参数；`SkillConfig` 联合不含冲刺，故攻击链路的 `config.weapon` 访问无需窄化。
- **HUD**：play 面板 SKILLS 区块首行展示 `dash`（动作格 = 冲刺期间状态机驻留时间，恢复格恒 `-`，冷却格同攻击技能规则）；原 DASH 单行计时器已移除。

---

## 四、中断系统

### 4.1 全局 flinching 状态

新增 `flinching` 到 `CHARACTER_STATES`：

```ts
export const CHARACTER_STATES = [
    'idle', 'walking', 'jumping', 'falling',
    'attacking', 'dying', 'dashing', 'flinching',
] as const
```

**触发条件**：`CombatComponent.onDamageTaken` 回调中，若 `attackActive === true`（攻击/技能释放中被击中）且 `flinchImmunityTimer <= 0`，设置 `combat.pendingFlinch = true`。

**受击保护窗口（防 stagger-lock）**：无限连段每段都会清空 `attackedTargets` 反复命中同一目标，若每次命中都能触发硬直，被击方每次重新起攻都会被下一击打断，永久锁在受击状态。因此 `flinching.exit` 挂 `flinchImmunityTimer = FLINCH_IMMUNITY_DURATION`（0.5s，> 轻链段间隔 0.4s），窗口内伤害照常结算但不再触发新硬直，保证被击方至少一个完整的反击/脱身窗口；计时器由 `world.ts` 主循环逐帧递减。

**flinching 状态行为**：

| 方法 | 行为 |
|------|------|
| `enter` | `attackActive = false`，`pendingFlinch = false`，`bufferedSkillIndex = -1`，阶段计时归零，速度归零（打断时非 0 冷却已在触发时挂上并继续计时；普通攻击无冷却不受影响） |
| `update` | 速度持续归零，不响应移动输入 |
| `exit` | 挂受击保护窗口 `flinchImmunityTimer = FLINCH_IMMUNITY_DURATION` |

**动画**：短暂后仰 + 手臂弹开，持续 0.1s（`FLINCH_DURATION`）。

**转换规则**（所有状态均需添加）：

```ts
{
    to: 'flinching',
    guard: (_input, entity) => entity.combat.pendingFlinch && entity.combat.health > 0,
}
// 优先级：dying > flinching > 其他转换
```

### 4.2 输入缓冲连段（软中断）

- 攻击中按攻击键只写缓冲，不打断当前段；当前段（含 recovery）完整播完后才消费缓冲推进
- 链内推进免冷却；普通攻击（近战链段 / 远程预设）冷却恒 0，节奏由动作/恢复时间形成；特殊技能的非 0 冷却从触发时开始计时，只挡起手不惩罚链中段
- 中途改按另一链的键 = 段末切链（需该起手槽冷却完毕，普通攻击恒满足）

### 4.3 Dash / Jump 取消（自中断）

- 仅在 `cancellable === true` 的阶段，dashing / jumping 的 transition guard 可以通过
- attacking meta-state 在 exit 时正常清理（冷却已在触发时挂上、comboIndex 重置）

### 4.4 状态转移图

```
                     ┌─→ flinching (受击，所有状态) ─→ idle/walking/falling
                     │
idle/walking ──→ attacking (meta-state)
                     │
                     │  phase0(cancellable) → phase1 → phase2(cancellable)
                     │       │                              │
                     │    combo输入?                    combo输入?
                     │    → 下一技能                     → 下一技能
                     │    dash/jump?                    dash/jump?
                     │    → dashing/jumping              → dashing/jumping
                     │
                     └─→ walking/idle/falling/jumping (攻击完成)
```

---

## 五、伤害判定几何（攻击判定箱 / 受击箱）

攻击相关的三个检测系统完全解耦，各自独立几何、独立 debug 可视化：

| 系统 | 几何 | 职责 | edit debug |
|------|------|------|-----------|
| 攻击判定箱 | 武器本地盒 → 世界 OBB（随武器模型移动） | 伤害判定 | 红色线框 |
| 攻击检测箱 | 近战：角色位置/朝向绑定的 OBB（尺寸与偏移由武器 `detectBox` 配置驱动）；远程：圆形距离判定 `dist <= weapon.range` | AI 出招门控（见 `docs/ai_system.md` 2.5） | 近战橙色线框 / 远程橙色射程圆环 |
| 视线检测 | 270° 扇形扫描射线（每 10° 一条）+ 角度门控 | 索敌（见 `docs/ai_system.md` 5.5） | 蓝色线条 |

### 5.1 攻击判定箱（武器本地命中箱）

- **来源**：武器构建时提供本地盒参数（`appearance/weapon_mesh.ts` 的 `WeaponLocalHitBox`，略包裹武器打击部位 + `WEAPON_HIT_BOX_PAD` 外扩），经 `CharacterModel.weaponGroup` / `weaponHitBox` 暴露；近战武器显式指定刃部/枪头/斧头/锤头区域，远程/投掷取默认盒。
- **reach 字段**：命中箱沿武器本地 +Y 轴（自握把延伸方向）的最大前伸量（`center.y + half.y`，含外扩边距），即武器打击部位距握把的最远距离；仅作命中箱几何属性保留，攻击检测箱已改由武器 `detectBox` 配置显式驱动（见 `docs/ai_system.md` 2.5）。
- **运行时**：`melee_executor` 命中窗口（`attackTimer / duration` 进度 0.1–0.85，跳过蓄力前段与恢复期）内强制 `weaponGroup.updateMatrixWorld()`，取 `matrixWorld.elements` 经 `obbFromTransform`（列主序，列向量含缩放）得世界 OBB。
- **判定**：与目标受击箱 OBB 做 15 轴 SAT 相交（`combat/obb.ts` `obbIntersect`）。判定与 debug 可视化（`combat_vfx/hitbox_debug.ts` `syncWeaponDebugBox`）同源。

### 5.2 受击箱

与身体碰撞箱同尺寸（竖直胶囊包围盒 = `CHARACTER_BASE_SIZE` × `scale`），中心 = body 位置，随身体朝向 yaw 旋转（`targetHurtOBB`）。攻击判定与 AI 攻击检测共用同一受击箱。

### 5.3 命中结算

SAT 相交命中且目标不在 `attackedTargets`（每段攻击只结算一次）→ `applyDamage` + 击退冲量（方向 = 武器握把 → 目标的水平方向）+ `onHit` 回调（顿帧/相机震动等打击感）。击退方向以武器握把世界位置为起点（`weaponGroup.getWorldPosition`）。

---

## 六、动画系统重构

### 6.1 动画文件组织

每个攻击子状态独立拥有自己的 `AnimationHandler` 文件，与状态文件通过命名约定 1:1 配对：

```
states/attack/
├── heavy_sword/
│   ├── windup.ts        ← StateHandler（逻辑：定身、蓄力推进）
│   ├── strike.ts        ← StateHandler（逻辑：命中窗口、击退判定）
│   └── recovery.ts      ← StateHandler（逻辑：后摇、可取消窗口）
├── short_sword/
│   ├── strike.ts
│   └── recovery.ts
├── longbow/
│   ├── draw.ts
│   ├── aim.ts
│   └── release.ts
└── ...

animators/attack/
├── heavy_sword/
│   ├── windup.ts        ← AnimationHandler（动画：双手举过头顶蓄力）
│   ├── strike.ts        ← AnimationHandler（动画：全力下砸 + 躯干前倾）
│   └── recovery.ts      ← AnimationHandler（动画：缓慢收刀回中）
├── short_sword/
│   ├── strike.ts        ← AnimationHandler（动画：快速横斩 + 随机 tilt）
│   └── recovery.ts
├── longbow/
│   ├── draw.ts          ← AnimationHandler（动画：左手推弓 + 右手拉弦）
│   ├── aim.ts
│   └── release.ts       ← AnimationHandler（动画：释放 + 弓弦反弹）
└── ...
```

### 6.2 动画调度

`AppearanceSystem` 按**完整状态名**查找 animator：

```ts
const animator = getAnimator(state)
    ?? (state.startsWith('attacking_') ? getAnimator('attacking') : getAnimator('idle'))
```

`getAnimator` 通过判别式 Map 访问实现强类型（见第七章）。

每个 animator 文件完全自包含——直接读取 `model` 关节操作旋转，不依赖 phase config 参数。

### 6.3 阶段动画预设示例

| 技能 | 阶段 | armSwingBack | armSwingForward | elbowBend | twoHanded | 描述 |
|------|------|:---:|:---:|:---:|:---:|------|
| heavy_sword_slam | windup | X:-2.0, Z:0 | — | 0.8 | 是 | 双手举过头顶 |
| heavy_sword_slam | strike | — | X:2.5, Z:0 | -0.1 | 是 | 全力下砸 |
| heavy_sword_slam | recovery | — | — | 0→0 | 是 | 缓慢收刀 |
| short_sword_slash | strike | X:-0.6, Z:±random | X:1.0, Z:±random | 0.1 | 否 | 快速横斩 + tilt |
| short_sword_slash | recovery | — | — | 0→0 | 否 | 单臂收回 |
| spear_thrust | windup | X:-0.8, Z:0 | — | 0.3 | 是 | 双手后拉 |
| spear_thrust | strike | — | X:1.8, Z:0 | 0 | 是 | 直线前刺 |
| dual_axe_spin | spin | X:-0.5, Z:-3.0 | — | 0.2 | 否 | 水平旋转，双斧交替 |
| longbow_shot | draw | X:-1.0, Z:0 | — | 0.6 | 是 | 左手推弓，右手拉弦 |
| longbow_shot | release | — | X:1.2, Z:0 | 0 | 是 | 释放 + 弦回弹 |
| staff_orb | aim | X:-0.5, Z:0 | — | 0.3 | 是 | 法杖前指 |
| staff_orb | release | — | X:0.8, Z:0 | 0.1 | 是 | 能量释放 |

### 6.4 回退兼容

当状态对应的 animator 不存在时，回退到通用 `attackingAnim`。通用 animator 使用 `attackTotalProgress` 按比例驱动三阶段动画（0→0.3 蓄力 / 0.3→0.6 打击 / 0.6→1.0 恢复），时间轴按技能总时长（`duration + recovery`）/ `FALLBACK_ATTACK_DURATION`（0.5）等比缩放。

---

## 七、强类型状态搜索

### 7.1 类型推导

所有攻击子状态名由武器预设 key + 阶段名通过模板字面量推导：

```ts
// character/combat/attack_phases.ts

type MeleeSkillId = keyof typeof MELEE_SKILL_PRESETS
type RangedSkillId = keyof typeof RANGED_SKILL_PRESETS

/** 编译期计算所有可能的攻击子状态名 */
type AttackSubState = `attacking_${MeleeSkillId | RangedSkillId}_${AttackPhaseName}`
// 结果: "attacking_short_sword_slash_strike"
//      | "attacking_heavy_sword_slam_windup"
//      | "attacking_longbow_shot_draw"
//      | ...（所有组合）
```

### 7.2 状态机侧判别式 Map

```ts
// character/state_machine/machine.ts

type AllStateNames = CharacterState | AttackSubState

const stateHandlerMap = new Map<string, StateHandler>()

const getStateHandler = <K extends string>(key: K): Record<AllStateNames, StateHandler>[K & AllStateNames] | undefined =>
    stateHandlerMap.get(key) as Record<AllStateNames, StateHandler>[K & AllStateNames] | undefined
```

### 7.3 动画系统侧判别式 Map

```ts
// entity/character/appearance/system.ts

type AnimStateMap = Record<CharacterState, AnimationHandler>
    & Record<AttackSubState, AnimationHandler>

const animatorMap = new Map<string, AnimationHandler>()

const getAnimator = <K extends string>(state: K): AnimStateMap[K & keyof AnimStateMap] | undefined =>
    animatorMap.get(state) as AnimStateMap[K & keyof AnimStateMap] | undefined
```

调用侧：

```ts
const animator = getAnimator(state)
    ?? (state.startsWith('attacking_') ? getAnimator('attacking') : getAnimator('idle'))
// animator 类型为精确的 AnimationHandler，下游无需再 as
```

---

## 八、新增攻击状态 / 武器指南

### 8.1 为新武器添加完整攻击状态

1. 在 `src/character/weapon/melee_weapon.ts`（或 `ranged_weapon.ts`）的 `PRESETS` 中添加武器预设
2. 在 `src/character/combat/melee_skill.ts`（或 `ranged_skill.ts`）的 `PRESETS` 中添加技能预设，**必须定义 phases 数组**
3. 在 `src/character/state_machine/states/attack/{skillId}/` 下创建各阶段 `StateHandler` 文件
4. 在 `src/character/state_machine/machine.ts` 中调用 `registerStateHandler(key, handler)` 注册
5. 在 `src/entity/character/appearance/animators/attack/{skillId}/` 下创建各阶段 `AnimationHandler` 文件
6. 在 `src/entity/character/appearance/system.ts` 中调用 `registerAnimator(key, handler)` 注册
7. 更新 `CombatComponent` 的 `comboChain`（如果该技能应属于连招链）

### 8.2 仅使用默认行为（无专用状态文件）

仅在技能预设中定义 `phases` 数组即可。attacking meta-state 在找不到阶段专用 handler 时会使用默认行为：有移动输入时按 `moveSpeedMultiplier` 缩放 `config.speed` 驱动移动（攻击中推进/突进，同 walking 的斜坡投影/吸附逻辑）；无移动输入时衰减残留速度 + 斜坡防滑。注意不能只衰减存量速度：无限连段下 AI 长期驻留 attacking，速度会衰减到 0 且永不补充，导致攻击一段时间后站桩不动。动画回退到通用 `attackingAnim`（按 `attackTotalProgress` 比例播放）。

### 8.3 新增 flinching 触发源

在伤害回调或环境效果中设置 `combat.pendingFlinch = true`，下一帧 attacking meta-state 会通过 transition guard 检测到并转入 flinching。

---

## 九、核心文件索引

| 层级 | 文件 | 内容 |
|------|------|------|
| **NEW** | `src/character/combat/attack_phases.ts` | `AttackPhase`、`AttackAnimConfig`、`EasingType` 类型；阶段解析工具；类型推导 |
| 修改 | `src/character/combat/melee_skill.ts` | `MeleeSkillConfig` 新增 `phases`、`comboChain`；6 个预设补充阶段定义 |
| 修改 | `src/character/combat/ranged_skill.ts` | `RangedSkillConfig` 新增 `phases`、`comboChain`；9 个预设补充阶段定义 |
| 修改 | `src/character/combat/skill_types.ts` | `SkillSlot` 新增 `comboChain`；`ComboGuardContext`/`ComboGuard` 类型；`triggerGuard`/`entryGroup` 字段 |
| **NEW** | `src/character/combat/combo_guard.ts` | 守卫求值与解析：`evalComboGuard`/`resolveEntrySkillIndex`/`resolveChainNextIndex`/`chainGroupOf` + 常用守卫（holdAtLeast/holdLessThan/hasMoveInput/noMoveInput） |
| **NEW** | `src/character/combat/test_weapon.ts` | 测试武器：6 槽守卫链装配（蓄力/点按兜底/键组分离/方向变体/循环链/无链单发），仅供单元测试 |
| 修改 | `src/character/combat/types.ts` | `CombatComponent` 新增 `phaseIndex`、`phaseTimer`、`comboIndex`、`comboTimer`、`pendingFlinch` |
| 修改 | `src/character/state_machine/types.ts` | `CHARACTER_STATES` 新增 `'flinching'`；`MachineContext` 新增 `attackPhase`；`CharacterInput` 新增 `attackHoldDuration`（蓄力按住时长），`setInput` 第 7 参 |
| 修改 | `src/character/state_machine/machine.ts` | 动态 handler 解析（`Map<string, StateHandler>` + 判别式访问）；阶段感知的 skillIndex 设置 |
| **重写** | `src/character/state_machine/states/attacking.ts` | 阶段调度 meta-state：enter 初始化阶段索引 → update 推进阶段 + 委托 → exit 清理 |
| **NEW** | `src/character/state_machine/states/flinching.ts` | flinching 状态 handler |
| **NEW** | `src/character/state_machine/states/attack/` | 武器特定攻击子状态文件（`{skillId}/{phaseName}.ts`） |
| 修改 | `src/entity/character/appearance/types.ts` | `AnimationContext` 新增 `attackPhase`、`attackPhaseProgress`、`attackTotalProgress` |
| 修改 | `src/entity/character/appearance/system.ts` | `Map<string, AnimationHandler>` + 判别式访问；传递阶段信息给 animator |
| **重写** | `src/entity/character/appearance/animators/attacking.ts` | 保留为通用回退 animator（使用 `attackTotalProgress` 按比例缩放时间轴） |
| **NEW** | `src/entity/character/appearance/animators/attack/` | 阶段专用 animator 文件（`{skillId}/{phaseName}.ts`） |
| 修改 | `src/entity/character/physics/world.ts` | 传递 `phaseIndex`/`phaseTimer`/`totalProgress` 给外观系统；更新 executor 调度；`setPlayerAttack(idx, holdDuration)` 蓄力脉冲与起手守卫解析；test_weapon 装配特判 |
| 修改 | `src/modes/play/camera.ts` | 攻击键按住计时（mousedown 记录时刻，mouseup 携带按住秒数触发，右键重击同为松开触发） |
| **NEW** | `src/entity/character/combat/obb.ts` | OBB 类型 + `yawOBB` / `obbFromTransform` / 15 轴 SAT `obbIntersect` |
| 修改 | `src/entity/character/combat/melee_executor.ts` | 伤害判定改武器 OBB × 受击箱 OBB（`testMeleeHit`）；攻击检测箱 `attackDetectOBB` / `testAttackDetect` |
| 修改 | `src/entity/character/appearance/weapon_mesh.ts` | 武器本地命中箱 `WeaponLocalHitBox`（近战武器显式打击部位盒） |
| 修改 | `src/entity/character/appearance/model.ts` | 暴露 `weaponGroup` / `weaponHitBox` |
| 修改 | `src/entity/character/combat_vfx/hitbox_debug.ts` | 判定箱（红）/受击箱（青）/检测箱（橙）/射程圆环（橙，远程）/视线扇形（蓝）五组件 debug 可视化 |

---

## 十、CombatComponent 字段变更清单

| 字段 | 类型 | 说明 |
|------|------|------|
| `currentSkillIndex` | `number` | 保留，当前技能槽索引 |
| `attackActive` | `boolean` | 保留 |
| `attackTimer` | `number` | 保留，攻击总计时 |
| `attackedTargets` | `Set<number>` | 保留 |
| `swingTilt` | `number` | 保留（段固有倾斜角，enter/段末推进时从预设写入，非随机） |
| **NEW** `phaseIndex` | `number` | 当前所在阶段索引（0-based） |
| **NEW** `phaseTimer` | `number` | 当前阶段已用时间（秒） |
| **NEW** `chainEntryIndex` | `number` | 本次起链的起手槽索引（决定当前链键组） |
| **NEW** `bufferedSkillIndex` | `number` | 缓冲的目标技能槽索引（-1 = 无缓冲，段末消费） |
| **NEW** `pendingFlinch` | `boolean` | 是否被标记为需要受击硬直 |
| **NEW** `flinchImmunityTimer` | `number` | 受击保护剩余时间（秒）：flinching 退出后免再触发硬直，防无限连段锁死；伤害不受影响 |

---

## 十一、测试用例设计

> 测试框架：Vitest。测试文件命名为 `<被测模块>.test.ts`，与被测源文件同目录。测试使用 `DT = 1/60` 固定帧步长、内联 mock 工厂函数（`as unknown as` 窄化）、`run(sm, entity, frames)` 帧进辅助函数和 `it.each()` 参数化测试。

### 11.1 AttackPhase 配置验证 — 新文件 `character/combat/attack_phases.test.ts`

**目的**：验证所有技能预设的 phases 配置完整且合法。

#### 基础约束

| # | 测试用例 | 验证方式 |
|---|----------|----------|
| 1 | 每个近战/远程技能预设的 `phases` 已定义且非空数组 | `it.each` 遍历 `MELEE_SKILL_PRESETS` + `RANGED_SKILL_PRESETS` |
| 2 | 每个阶段的 `durationRatio` 在 (0, 1] 区间 | `it.each` 遍历每个技能的每个阶段 |
| 3 | 每个技能的阶段比例之和 ≤ 1 | 逐技能累加 `durationRatio` |
| 4 | 每个阶段的 `moveSpeedMultiplier` 在 [0, 1] 区间 | `it.each` |
| 5 | 每个阶段的 `name` 是 `ATTACK_PHASES` 的有效成员 | `it.each` |
| 6 | 阶段序列的最后一个阶段 `durationRatio` 使总和恰好接近 1（±0.01 容差），避免"悬空时间" | 逐技能验证 `sum >= 0.99 && sum <= 1.01` |

#### 设计不变量

| # | 测试用例 | 验证方式 |
|---|----------|----------|
| 7 | 重武器（heavy_sword、war_hammer）的 windup `durationRatio` 高于轻武器（short_sword、throwing_dart） | 跨预设比较 |
| 8 | 有 `comboChain` 定义的技能，链中每个 ID 都存在对应的技能预设 | 查找 `MELEE_SKILL_PRESETS` 或 `RANGED_SKILL_PRESETS` |
| 9 | 远程武器 phase 名称只使用 `draw`/`aim`/`release`，近战只使用 `windup`/`strike`/`recovery`/`spin` | 按 `skill.type` 检查 `phase.name` 集合 |
| 10 | `cancellable === true` 的阶段只能是 windup、recovery、aim（不能在 strike/draw/release 中可取消） | `it.each` |

#### 动画参数约束

| # | 测试用例 | 验证方式 |
|---|----------|----------|
| 11 | `animConfig.easing` 是 `EASING_TYPES` 的有效成员 | `it.each` |
| 12 | windup/aim 阶段 `armSwingBackX < 0`（手臂向后蓄力） | 按阶段类型断言 |
| 13 | strike/release 阶段 `armSwingForwardX > 0`（手臂向前打击） | 按阶段类型断言 |
| 14 | `twoHanded === true` 的武器，所有阶段 `twoHanded` 保持一致 | 按技能遍历 |

#### 回退兼容

| # | 测试用例 | 验证方式 |
|---|----------|----------|
| 15 | `resolvePhases(undefined, 0.3)` 生成单阶段回退 `[{name: "strike", durationRatio: 1, moveSpeedMultiplier: 0.3, cancellable: false}]` | 直接调用函数断言 |
| 16 | 回退阶段的 `duration` 使用传入的默认值 | 断言 `durationRatio === 1` |
| 17 | 回退阶段与重构前 attacking 行为参数一致（0.3 移速倍率） | 断言 `moveSpeedMultiplier === 0.3` |

---

### 11.2 技能配置扩展测试 — 扩展 `melee_skill.test.ts` / `ranged_skill.test.ts`

**目的**：在现有技能测试基础上追加 phases 和 comboChain 的验证。

| # | 测试用例 | 验证方式 |
|---|----------|----------|
| 1 | 每个技能预设的 `phases` 不为 `undefined` | `it.each` |
| 2 | 有 `comboChain` 的技能，链中每个 skill ID 的类型匹配（近战→近战、远程→远程） | 通过 `MELEE_SKILL_PRESETS` / `RANGED_SKILL_PRESETS` 查找校验 |
| 3 | `comboChain` 中的 ID 与自身 ID 不同（不应自引用） | `it.each` |

---

### 11.3 状态机阶段调度测试 — 扩展 `machine.test.ts`

**目的**：验证 attacking meta-state 的阶段推进和委托逻辑。

#### Mock 构造

```ts
// 使用带 phases 的 skill 构造 entity mock
const makePhaseMock = (skillId: string = 'heavy_sword_slam'): CharacterEntity => {
    const preset = MELEE_SKILL_PRESETS[skillId] ?? MELEE_SKILL_PRESETS.long_sword_slash
    const slot = createSkillSlot(preset)
    // ... 其余字段同现有 makeMock()，但需包含新增的 combat 字段
    combat: {
        // ... 现有字段
        phaseIndex: 0, phaseTimer: 0,
        comboIndex: 0, comboTimer: 0,
        pendingFlinch: false,
    }
}
```

#### 阶段推进

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 1 | 进入 attacking 时 `phaseIndex === 0`，`phaseTimer === 0` | `setInput(0, 0, false, true)` → `update(DT)` | `combat.phaseIndex === 0`，`combat.phaseTimer === 0` |
| 2 | 阶段推进：`phaseTimer >= phaseDuration` 时 `phaseIndex++` | 用 `run()` 推进帧数使 `combat.attackTimer` 超过第一阶段时长 | `combat.phaseIndex` 递增到下一阶段 |
| 3 | 最后一个阶段结束后正常 transition 出 attacking | `run()` 超过 `skill.duration` | `currentState !== 'attacking'` |
| 4 | 阶段内 `moveSpeedMultiplier` 生效 | 在第一阶段（windup，移速 0.1）检查 velocity 衰减 | `velocity.x` 被乘以对应倍率 |
| 5 | 阶段切换时 velocity 倍率跟随更新 | 进入 strike 阶段（移速 0） | vertical/horizontal velocity 被归零 |

#### 阶段委托

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 6 | 已注册的阶段 handler 被调用 | 向 `stateHandlerMap` 注册 `'attacking_heavy_sword_slam_windup'` 的 mock handler（含计数标记） | mock handler 的 `enter`/`update`/`exit` 被调用 |
| 7 | 未注册的阶段 handler 回退到 `attackingHandler` | 使用未注册 handler 的 skill | 执行默认阶段行为（减速 + 斜坡防滑），不崩溃 |
| 8 | 默认回退的进入/更新/退出不抛异常 | `resolvePhaseHandler('nonexistent_skill', 'windup')` | 返回 `STATE_HANDLERS['attacking']` |

#### 无 phases 回退兼容

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 9 | 技能无 `phases` 定义时使用单阶段回退 | 构造 mock 技能无 phases | `phaseIndex` 保持 0，`attackTimer >= duration` 后直接退出 attacking |
| 10 | 回退时移速倍率为 0.3（与原 attacking 一致） | 无 phases + velocity 初始值非零 | 每帧 velocity 乘以 0.3 |
| 11 | 回退时 swingTilt 正常随机（近战） | 无 phases + type==='melee' | `swingTilt` 取非零值 |

---

### 11.4 flinching 状态测试 — 新文件 `character/state_machine/states/flinching.test.ts`

**目的**：验证受击硬直状态的触发、行为和转换。

#### 触发条件

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 1 | `pendingFlinch === true` + `health > 0` → 进入 flinching | attacking 状态中设置 `pendingFlinch = true` | `currentState === 'flinching'` |
| 2 | `pendingFlinch === true` + `health === 0` → 进入 dying，不进 flinching | `health = 0`，`pendingFlinch = true` | `currentState === 'dying'` |
| 3 | `pendingFlinch === false` → 即使受击也不进 flinching | `onDamageTaken` 触发但 `attackActive === false` | `pendingFlinch` 保持 `false`，不进入 flinching |
| 4 | 在 idle 状态受击（`attackActive === false`）→ 不进 flinching | 普通行走时受伤 | 保持原状态，`pendingFlinch` 保持 `false` |

#### Enter 行为

| # | 测试用例 | 验证方式 |
|---|----------|----------|
| 5 | `enter` 后将 `pendingFlinch` 重置为 `false` | 进入 flinching 后检查 |
| 6 | `enter` 后将 `attackActive` 设为 `false` | 进入 flinching 后检查 |
| 7 | `enter` 后将当前技能冷却设为 `skill.cooldown`（打断惩罚） | 进入 flinching 后检查 `cooldownTimer` |
| 8 | `enter` 后将 `comboIndex` 重置为 0 | `comboIndex === 0` |
| 9 | `enter` 后 velocity 归零 | `velocity.length() < 0.001` |

#### Update 行为

| # | 测试用例 | 验证方式 |
|---|----------|----------|
| 10 | `update` 持续将 velocity 归零（不响应移动输入） | `setInput(1, 0, false, false)` 后 velocity 仍为 0 |
| 11 | `update` 调用 `body.wakeUp()` | mock body 的 `wakeUp` 被调用 |

#### 转换

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 12 | `stateTime >= FLINCH_DURATION` + 有支撑 + 移动输入 → walking | `isOnGround = true`，`setInput(1, 0, false, false)`，推进帧数超过 `FLINCH_DURATION` | `currentState === 'walking'` |
| 13 | `stateTime >= FLINCH_DURATION` + 有支撑 + 无输入 → idle | `isOnGround = true`，`setInput(0, 0, false, false)` | `currentState === 'idle'` |
| 14 | `stateTime >= FLINCH_DURATION` + 无支撑 → falling | `isOnGround = false`，`shouldFall === true` | `currentState === 'falling'` |
| 15 | `stateTime >= FLINCH_DURATION` + jump → jumping | `isOnGround = true`，`setInput(0, 0, true, false)` | `currentState === 'jumping'` |
| 16 | health ≤ 0 时立刻转 dying（优先级最高） | `health = 0` | `currentState === 'dying'` |

#### 全状态 flinching guard

| # | 测试用例 | 验证方式 |
|---|----------|----------|
| 17 | idle 状态的 transitions 包含 `→ flinching` guard | `idleHandler.transitions.find(t => t.to === 'flinching')` 存在且 guard 正确 |
| 18 | walking 状态的 transitions 包含 `→ flinching` guard | 同上 |
| 19 | jumping 状态的 transitions 包含 `→ flinching` guard | 同上 |
| 20 | falling 状态的 transitions 包含 `→ flinching` guard | 同上 |
| 21 | attacking 状态的 transitions 包含 `→ flinching` guard | 同上 |
| 22 | dashing 状态的 transitions 包含 `→ flinching` guard | 同上 |
| 23 | `→ flinching` guard 在 `→ dying` guard 之后（优先级低于 dying） | `transitions` 数组中 dying 的索引 < flinching 的索引 |

---

### 11.5 连招系统测试 — 可合入 `machine.test.ts` 或新文件

**目的**：验证连招链的推进、中断和超时。

#### Combo 推进

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 1 | cancellable 阶段 + `input.attack === true` + `comboTimer > 0` → 推进到下一技能 | `phaseIndex` 在 cancellable 阶段，保持 `attack = true` | `currentSkillIndex` 或 skill id 切换为链中下一个 |
| 2 | cancellable 阶段 + `input.attack === false` → 不推进 | `phaseIndex` 在 cancellable 阶段，`attack = false` | 正常走完当前攻击 |
| 3 | 非 cancellable 阶段 + `input.attack === true` → 不推进 | `phaseIndex` 在 strike 阶段（`cancellable = false`） | 不触发 combo，正常完成攻击 |
| 4 | `comboTimer === 0` 时即使 cancellable 也不推进 | 手动设 `comboTimer = 0` | 不触发 combo |

#### Combo 超时

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 5 | 攻击完成后 `comboTimer` 递减，到 0 后 `comboIndex` 重置 | 进入 recovery 阶段，不再提供 `attack` 输入 | `comboTimer` 逐步归零，`comboIndex === 0` |
| 6 | combo 输入窗口在 `COMBO_WINDOW`（0.3s）后关闭 | 攻击结束 + 0.3s 后 | `comboTimer === 0` |

#### Combo 链边界

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 7 | `comboIndex` 到达链尾时，再接 `attack` 不推进 | `comboIndex === comboChain.length - 1` | 正常收尾 |
| 8 | 链中下一技能冷却中 → 不推进 | 下一技能的 `cooldownTimer > 0` | 不触发 combo |
| 9 | `comboChain` 为 `undefined` 时，`attack` 输入在 cancellable 阶段不触发 combo | 无 comboChain 定义的技能 | 正常单次攻击收尾 |
| 10 | 多次连招循环（AA→B→A→A→B）| 反复输入 | `comboIndex` 正确递增并循环重置 |

#### AI 连招

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 11 | AI 连续保持 `attack = true` 时自动走完整条 combo 链 | `setInput(dx, dz, false, true)` 持续多帧 | 链中所有技能被依次执行 |
| 12 | AI `attack = true` 在 `cancellable === false` 的阶段不触发 combo | 同上但阶段不可取消 | combo 不推进，完成释放后正常退出 |

---

### 11.6 中断优先级测试 — 可合入 `machine.test.ts`

**目的**：验证各种中断源的优先级顺序。

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 1 | dying 优先级 > flinching | `health = 0` + `pendingFlinch = true` | 进入 `dying`，不进入 `flinching` |
| 2 | flinching 优先级 > combo | `pendingFlinch = true` + cancellable 阶段 + `attack = true` | 进入 `flinching`，不推进 combo |
| 3 | flinching 优先级 > dash | `pendingFlinch = true` + cancellable 阶段 + `sprint = true` | 进入 `flinching`，不进入 `dashing` |
| 4 | dash 优先级 > combo | cancellable 阶段 + `sprint = true` + `attack = true` | 进入 `dashing`（dash 转换在 combo 逻辑之前被遍历到），不推进 combo |
| 5 | combo 推进后攻击强制完成（新攻击不可被旧攻击的 dash 打断） | combo 推进到非 cancellable 阶段 | dash 不生效 |

---

### 11.7 动画系统测试 — 新文件 `entity/character/appearance/attack_anim.test.ts`

**目的**：验证 AnimationContext 的阶段信息传递和 animator 回退。

#### AnimationContext 传递

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 1 | 在 attacking 状态中 `AnimationContext.attackPhase` 等于当前阶段名 | `currentState === 'attacking'` + `phaseIndex = 0` + `skill = heavy_sword_slam` | `ctx.attackPhase === 'windup'` |
| 2 | 在非 attacking 状态中 `AnimationContext.attackPhase` 为 `undefined` | `currentState === 'idle'` | `ctx.attackPhase === undefined` |
| 3 | `attackPhaseProgress` = `phaseTimer / phaseDuration`（0~1 之间） | attacking 中途 | `>= 0 && <= 1`，与手动计算一致 |
| 4 | `attackTotalProgress` = `attackTimer / skill.duration`（0~1 之间） | attacking 中途 | `>= 0 && <= 1`，与手动计算一致 |
| 5 | 阶段切换时 `attackPhaseProgress` 重置为 0 | `phaseIndex` 从 0 推进到 1 | 新阶段首帧 `attackPhaseProgress` 接近 0 |

#### Animator 查找与回退

| # | 测试用例 | 前置条件 | 预期结果 |
|---|----------|----------|----------|
| 6 | 已注册的阶段 animator 被 `getAnimator()` 找到 | 注册 `'attacking_heavy_sword_slam_windup'` | 返回对应 `AnimationHandler` |
| 7 | 未注册的阶段 animator → `getAnimator()` 回退到 `'attacking'` | 传递 `'attacking_unknown_windup'` | 返回 `ANIMATION_HANDLERS['attacking']` |
| 8 | 回退 `attackingAnim.update()` 使用 `attackTotalProgress` 而非硬编码时间 | 回退动画 + `duration = 0.6s`，`attackTimer = 0.3s` | 动画时间轴按 50% 进度缩放（`t' = 0.3 * 0.5 = 0.15s`） |
| 9 | `getAnimator()` 对非 attacking 前缀的状态正确查询 | 传递 `'idle'` | 返回 `ANIMATION_HANDLERS['idle']` |

---

### 11.8 强类型状态名测试 — 可合入 `attack_phases.test.ts`

**目的**：验证模板字面量类型推导的正确性。

| # | 测试用例 | 验证方式 |
|---|----------|----------|
| 1 | `AttackSubState` 类型包含已知组合 `"attacking_short_sword_slash_strike"` | 赋值给 `const x: AttackSubState = ...`，编译通过 |
| 2 | `AttackSubState` 类型包含所有近战技能 × 所有阶段 | 计数验证 |
| 3 | 不在预设中的阶段名组合编译报错 | `// @ts-expect-error` 断言 |
| 4 | `getStateHandler("attacking_heavy_sword_slam_windup")` 返回类型为 `StateHandler` | 类型推断通过 |
| 5 | `getAnimator("attacking_longbow_shot_draw")` 返回类型为 `AnimationHandler` | 类型推断通过 |

---

### 11.9 测试文件清单

| 测试文件 | 对应被测模块 | 类型 |
|----------|-------------|------|
| **NEW** `character/combat/attack_phases.test.ts` | `attack_phases.ts` — 阶段配置 + 类型推导 | 新文件 |
| 扩展 `character/combat/melee_skill.test.ts` | `melee_skill.ts` — phases/comboChain 追加 | 扩展现有 |
| 扩展 `character/combat/ranged_skill.test.ts` | `ranged_skill.ts` — phases/comboChain 追加 | 扩展现有 |
| **NEW** `character/combat/combo_guard.test.ts` | `combo_guard.ts` + `test_weapon.ts` — 守卫边界/起手解析/链下一段/键组映射（19 用例） | 新文件 |
| 扩展 `character/state_machine/machine.test.ts` | `attacking.ts` — 阶段调度 + handler 委托 + 回退 + 守卫集成（蓄力/方向变体起手与段末推进，makeMock 支持自定义 slots） | 扩展现有 |
| **NEW** `character/state_machine/states/flinching.test.ts` | `flinching.ts` — 硬直状态完整生命周期 | 新文件 |
| **NEW** `entity/character/appearance/attack_anim.test.ts` | `system.ts` + `attacking.ts` — 阶段动画上下文 + 回退 | 新文件 |
