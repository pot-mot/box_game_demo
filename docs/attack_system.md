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
  └─ attacking  meta-state（阶段调度器，states/attacking.ts）
       └─ 按 key = "attacking_{skillId}_{phaseName}" 查 phaseHandlerRegistry
            ├─ 找到 → 委托阶段专用 StateHandler 的 update
            └─ 未找到 → 默认阶段行为（按 moveSpeedMultiplier 缩放移动 + 斜坡投影/防滑）

动画表现层（entity/character/appearance/）
  └─ ANIMATION_HANDLERS（静态 Record<CharacterState, AnimationHandler>，每基础状态一个 animator）
       └─ attackingAnim 按 AnimationContext 的阶段信息驱动：
            ├─ 有 attackPhases → 相邻阶段末姿态链式插值（phaseEndPose 按阶段名解释 animConfig）
            └─ 无阶段信息 → 回退虚拟三阶段（windup/strike/recovery，按 attackTotalProgress 映射）
```

**关键**：阶段逻辑与阶段动画均已收敛为"通用调度 + 数据驱动"——阶段特定逻辑通过 `registerPhaseHandler`（attacking.ts）按 `attacking_{skillId}_{phaseName}` 命名约定运行时注入（当前生产武器全部走默认行为）；动画统一由 `attackingAnim` 按 `AttackPhase.animConfig` 的语义参数驱动，无 per-phase animator 文件。

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

/** 攻击动作类型：slash=挥砍弧线 thrust=直线刺击 spin=旋转横扫 */
export const ATTACK_TYPES = ['slash', 'thrust', 'spin'] as const
export type AttackType = typeof ATTACK_TYPES[number]

/** 攻击阶段配置 */
export interface AttackPhase {
    /** 阶段名，构成状态名 "attacking_{skillId}_{name}" */
    readonly name: AttackPhaseName
    /** 占动作时间的比例（0-1），动作阶段（非 recovery）比例之和应为 1；
     *  recovery 阶段不参与分摊，时长直接取 config.recovery */
    readonly durationRatio: number
    /** 移速倍率：0 = 完全定身，1 = 全速移动 */
    readonly moveSpeedMultiplier: number
    /** 是否可被 dash / jump 打断（combo 输入走段末缓冲，不受此限制） */
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
    /** 动作类型判别字段 — 决定动画器使用哪套关节驱动语义（slash=挥砍弧线 / thrust=直线刺击 / spin=旋转横扫） */
    readonly attackType: AttackType
    /** 打击阶段速度峰值位置（0-1，末端加速挥砍） */
    readonly strikePeakRatio: number
    /** 恢复阶段惯性过冲比例（0-1） */
    readonly overshootRatio: number
}
```

### 2.2 阶段解析

```ts
// character/state_machine/states/attacking.ts
/** 阶段子状态 handler 注册表 — 外部通过 registerPhaseHandler 注入 */
export const phaseHandlerRegistry = new Map<string, StateHandler>()

export const registerPhaseHandler = (key: string, handler: StateHandler): void => {
    phaseHandlerRegistry.set(key, handler)
}

// attackingHandler.update 内：
const phaseKey = c.phaseIndex < phases.length
    ? `attacking_${skill.config.id}_${phases[c.phaseIndex].name}`
    : undefined
const phaseHandler = phaseKey ? phaseHandlerRegistry.get(phaseKey) : undefined
// 找到 → 委托 update（stateTime = phaseTimer、attackPhase = 阶段名）；
// 未找到 → 默认阶段行为（moveSpeedMultiplier 缩放 + 斜坡投影/防滑）
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
- attacking meta-state 在 exit 时正常清理（冷却已在段触发时挂上、`bufferedSkillIndex`/阶段计时重置）

### 4.4 状态转移图

```
                     ┌─→ flinching (受击，所有状态) ─→ idle/walking/falling
                     │
idle/walking ──→ attacking (meta-state)
                     │
                     │  阶段推进：phase0(cancellable) → phase1 → … → 最终阶段
                     │       │
                     │   攻击输入?（任意时刻）→ 写缓冲，最终阶段播完后推进下一段
                     │   dash/jump?（仅 cancellable 阶段）
                     │   → dashing/jumping
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

> **显示范围**：上述 debug 信息与碰撞胶囊体**仅对被选中的角色显示**（`world.ts` `refreshSelectionVisibility`）：未选中角色的胶囊不透明度降为 0（保留 mesh 供射线拾取），五组件线框全部隐藏；选中切换/面板瞬移（`setTransform`）/朝向修改（`setFacing`，0-360°）时经 `placeDebugBoxes` 重新定位，编辑暂停态（update 不运行）也能即时同步。

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

## 六、动画系统（骨骼 clip 化，M4 迁移后）

> 攻击动画已迁移至骨骼动画系统（`docs/bone_animation_system.md`）：原 `animators/` 目录全部删除，程序化阶段公式烘焙为关键帧 clip，命中窗口由动画事件轨道驱动。

### 6.1 动画文件组织

`entity/character/appearance/` 下按「姿态公式 → clip 生成器 → 调度器」组织：

```
appearance/
├── pose_fns.ts            ← 基础状态姿态纯函数（公式提取自旧 animator，固定频率）
├── clips/
│   ├── base_clips.ts      ← 基础状态 clip 生成器（60fps 烘焙，循环 wrap/非循环 clamp，weaponHeld 变体）
│   ├── attack_clips.ts    ← 攻击 clip 生成器（阶段公式全量烘焙 + hitbox 事件轨）
│   └── *.test.ts
├── skeleton_bridge.ts     ← 角色模型 Group ↔ 骨架桥接（以场景为真源）
└── system.ts              ← clip 调度器（动画键 → 播放器 → 快照加权混合）
```

### 6.2 动画调度

`AppearanceSystem`（`system.ts`）为 clip 调度器：

- **动画键**：基础状态 `${state}:${weaponHeld?'w':'n'}`；attacking 附加技能 id（`attacking:${skillId}`），链段切换触发快照混合。
- **快照加权混合**：状态/键切换瞬间抓取全部关节快照，新 clip 采样输出 × w + 快照 × (1−w)（w 三次 ease-out，`STATE_BLEND_DURATION`）。
- **桥接**：模型关节经 `createCharacterSkeletonBridge`（Group 层级自动建连）绑定为骨架，播放器 `applyPose` 写骨架 → 桥接写回 Group（场景图级联）。
- **双手武器 IK**：attacking 且 `twoHanded` 时左腕链（左肩 IK 根 → 左肘 → 左腕）每帧 `solveCcd` 追「右腕 + 武器轴 × 0.45m」握柄点（applyPose 先写、IK 后写）。

### 6.3 攻击 clip 生成（attack_clips.ts）

`buildAttackClip({skillId, duration, recovery, phases, tilt, gripTilt})` 按 60fps 烘焙阶段公式：

- **阶段末姿态**：`phaseEndPose(phase, tilt)` 按阶段名语义解释 `animConfig`（windup/draw 蓄力、aim/spin 维持、strike/release 随动、recovery 归位）——公式与旧 attackingAnim 逐行一致；
- **插值**：上一阶段末姿态 → 本阶段末姿态链式插值；`strike`/`release` 用 `strikeCurve`（末端加速峰值在 `strikePeakRatio`），其余按 `easing`；恢复起点叠加 `overshootRatio` 惯性过冲；aim/spin 叠加持械微颤；
- **附加驱动**：弓步腿角 + 重心下沉、左臂（双手扶柄 / 单手平衡反摆）、腕部刃面偏转（`gripTilt` 抵消 + `swingTilt` 横斩偏转）、头部侧偏与摆动；
- **时间映射**：`spanAt(t)` 按阶段时长（`phaseDurationOf`）累加定位阶段跨度，全部完成后维持末阶段 p=1（clamp）；
- **事件轨**：近战命中窗口 `hitbox_on` @ 0.1×duration、`hitbox_off` @ 0.85×duration（与旧 executor 计时窗口一致，驱动 `melee_executor.setHitWindow`）；
- **swingTilt** 为技能段固有配置（`MeleeSkillConfig.swingTilt`），每技能段单一 clip 内嵌对应 tilt；clip 缓存按 skillId + gripTilt + duration/recovery。

### 6.4 无阶段信息回退

`attackPhases` 缺失时生成器回退虚拟三阶段（`FALLBACK_PHASES`），clip 时长 = `FALLBACK_ATTACK_DURATION`（0.5），按总进度映射（同旧 6.4 语义）。

### 6.5 阶段动画参数示例

| 技能 | 阶段 | armSwingBack | armSwingForward | elbowBend | twoHanded | 描述 |
|------|------|:---:|:---:|:---:|:---:|------|
| heavy_sword_slam | windup | X:-2.0, Z:0 | — | 0.8 | 是 | 双手举过头顶 |
| heavy_sword_slam | strike | — | X:2.5, Z:0 | -0.1 | 是 | 全力下砸 |
| heavy_sword_slam | recovery | — | — | 0→0 | 是 | 缓慢收刀 |
| short_sword_slash | strike | X:-0.6, Z:±tilt | X:1.0, Z:±tilt | 0.1 | 否 | 快速横斩 + tilt |
| short_sword_slash | recovery | — | — | 0→0 | 否 | 单臂收回 |
| spear_thrust | windup | X:-0.8, Z:0 | — | 0.3 | 是 | 双手后拉 |
| spear_thrust | strike | — | X:1.8, Z:0 | 0 | 是 | 直线前刺 |
| dual_axe_spin | spin | X:-0.5, Z:-3.0 | — | 0.2 | 否 | 水平旋转，双斧交替 |
| longbow_shot | draw | X:-1.0, Z:0 | — | 0.6 | 是 | 左手推弓，右手拉弦 |
| longbow_shot | release | — | X:1.2, Z:0 | 0 | 是 | 释放 + 弦回弹 |
| staff_orb | aim | X:-0.5, Z:0 | — | 0.3 | 是 | 法杖前指 |
| staff_orb | release | — | X:0.8, Z:0 | 0.1 | 是 | 能量释放 |

参数改动后由 clip 生成器自动重新烘焙（缓存按参数 key 失效），无需改动画代码。

---

## 七、类型安全的处理器查找

### 7.1 基础状态：静态 Record

基础状态的处理器用静态 `Record` 注册，编译期由 `Record` 的穷尽性保证类型安全（新增状态漏注册即编译报错）：

```ts
// character/state_machine/types.ts
export const CHARACTER_STATES = ['idle', 'walking', 'jumping', 'falling', 'attacking', 'dying', 'dashing', 'flinching'] as const
export type CharacterState = typeof CHARACTER_STATES[number]

// character/state_machine/machine.ts
const STATE_HANDLERS: Record<CharacterState, StateHandler> = {
    idle: idleHandler, walking: walkingHandler, /* ... */ flinching: flinchingHandler,
}

// entity/character/appearance/system.ts —— M4 迁移后为 clip 调度器（CLIP_STATES 覆盖全部状态，
// 姿态由 clips/base_clips + clips/attack_clips 生成器提供，不再有 AnimationHandler Record）
```

### 7.2 阶段子状态：运行时注册表

阶段子状态 key 为运行时字符串拼接（`attacking_${skillId}_${phaseName}`），由 `attacking.ts` 的 `phaseHandlerRegistry: Map<string, StateHandler>` 存取，未命中即走默认阶段行为。

```ts
// character/combat/attack_phases.ts —— 预留的模板字面量推导类型（当前未被注册表消费）
type MeleeSkillId = keyof typeof MELEE_SKILL_PRESETS
type RangedSkillId = keyof typeof RANGED_SKILL_PRESETS
export type AttackSubState = `attacking_${MeleeSkillId | RangedSkillId}_${AttackPhaseName}`
// 结果: "attacking_short_sword_slash_strike" | "attacking_heavy_sword_slam_windup" | ...
```

当前生产武器均未注册阶段 handler，全部走默认行为（见 8.2）；`AttackSubState` 类型保留供将来把注册表升级为判别式访问。

### 7.3 判别式 Map 访问约定

当 `Map<Key, BaseType>` 的值在运行时是不同类型的子类时，可通过泛型映射类型 `Record<Key, SubType>` 配合 `as` 做一次集中窄化（见 AGENTS.md 类型系统第 4 条），后续所有下游访问均获得精确类型。这是通用代码约定，不限于状态机。

---

## 八、新增攻击状态 / 武器指南

### 8.1 为新武器添加攻击技能

1. 在 `src/character/weapon/melee_weapon.ts`（或 `ranged_weapon.ts`）的 `PRESETS` 中添加武器预设
2. 在 `src/character/combat/melee_skill.ts`（或 `ranged_skill.ts`）的 `PRESETS` 中添加技能预设，**必须定义 phases 数组**（阶段名取自 `ATTACK_PHASES`；近战用 `windup`/`strike`/`recovery`/`spin`，远程用 `draw`/`aim`/`release`）
3. （可选）需要阶段专用逻辑时：创建 `StateHandler` 并在装配处调用 `registerPhaseHandler('attacking_{skillId}_{phaseName}', handler)`（由 `states/attacking.ts` 导出；当前生产武器全部走默认行为，未注册任何阶段 handler）
4. 动画无需专用文件：阶段姿态由 `phases[].animConfig` 驱动通用 `attackingAnim`（调整 `armSwingBack/Forward`、`elbowBend`、`bodyLean`、`twoHanded`、`easing`、`attackType`、`strikePeakRatio`、`overshootRatio` 即可）；挥砍类段固有倾斜角用 `MeleeSkillConfig.swingTilt`
5. 更新 `SkillSlot.comboChain`（如果该技能应属于连招链）

### 8.2 仅使用默认行为（当前全部生产武器）

仅在技能预设中定义 `phases` 数组即可。attacking meta-state 在找不到阶段专用 handler 时使用默认行为：有移动输入时按 `moveSpeedMultiplier` 缩放 `config.speed` 驱动移动（攻击中推进/突进，同 walking 的斜坡投影/吸附逻辑）；无移动输入时衰减残留速度 + 斜坡防滑。注意不能只衰减存量速度：无限连段下 AI 长期驻留 attacking，速度会衰减到 0 且永不补充，导致攻击一段时间后站桩不动。动画由 `attackingAnim` 按 `attackPhases` 数据驱动（无阶段信息时回退 6.4 的虚拟三阶段）。

### 8.3 新增 flinching 触发源

在伤害回调或环境效果中设置 `combat.pendingFlinch = true`，下一帧 attacking meta-state 会通过 transition guard 检测到并转入 flinching。

---

## 九、核心文件索引

| 层级 | 文件 | 内容 |
|------|------|------|
| **NEW** | `src/character/combat/attack_phases.ts` | `AttackPhase`、`AttackAnimConfig`、`EasingType` 类型；阶段解析工具；类型推导 |
| 修改 | `src/character/combat/melee_skill.ts` | `MeleeSkillConfig` 新增 `phases`、`comboChain`、`swingTilt`；6 武器 × 4 链段（`MELEE_CHAIN_SLOTS`）预设补充阶段定义 |
| 修改 | `src/character/combat/ranged_skill.ts` | `RangedSkillConfig` 新增 `phases`、`comboChain`；9 个预设补充阶段定义 |
| 修改 | `src/character/combat/skill_types.ts` | `SkillSlot` 新增 `comboChain`；`ComboGuardContext`/`ComboGuard` 类型；`triggerGuard`/`entryGroup` 字段 |
| **NEW** | `src/character/combat/combo_guard.ts` | 守卫求值与解析：`evalComboGuard`/`resolveEntrySkillIndex`/`resolveChainNextIndex`/`chainGroupOf` + 常用守卫（holdAtLeast/holdLessThan/hasMoveInput/noMoveInput） |
| **NEW** | `src/character/combat/test_weapon.ts` | 测试武器：6 槽守卫链装配（蓄力/点按兜底/键组分离/方向变体/循环链/无链单发），仅供单元测试 |
| 修改 | `src/character/combat/types.ts` | `CombatComponent` 新增 `phaseIndex`、`phaseTimer`、`chainEntryIndex`、`bufferedSkillIndex`、`pendingFlinch`、`flinchImmunityTimer` |
| 修改 | `src/character/state_machine/types.ts` | `CHARACTER_STATES` 新增 `'flinching'`；`MachineContext` 新增 `attackPhase`；`CharacterInput` 新增 `attackHoldDuration`（蓄力按住时长），`setInput` 第 7 参 |
| 修改 | `src/character/state_machine/machine.ts` | 静态 `Record<CharacterState, StateHandler>` 注册 8 状态；transition guard 检查 + `onStateChange` 派发 |
| **重写** | `src/character/state_machine/states/attacking.ts` | 阶段调度 meta-state：enter 初始化阶段索引 → update 推进阶段 + 缓冲消费/委托 → exit 清理；导出 `phaseHandlerRegistry` / `registerPhaseHandler`（阶段子状态运行时注入，未注册走默认行为） |
| — | `src/character/state_machine/states/attack/` | 不存在——阶段子状态通过 `registerPhaseHandler` 运行时注入，当前生产武器全部走默认行为 |
| **NEW** | `src/character/state_machine/states/flinching.ts` | flinching 状态 handler |
| 修改 | `src/entity/character/appearance/types.ts` | `AnimationContext` 新增 `attackSkillId`、`attackPhase`、`attackPhaseProgress`、`attackTotalProgress`、`attackPhases`、`attackPhaseIndex` |
| 修改 | `src/entity/character/appearance/system.ts` | 静态 `Record<CharacterState, AnimationHandler>`；动画键 `state:skillId` 触发快照混合；传递阶段信息给 animator |
| **重写** | `src/entity/character/appearance/animators/attacking.ts` | 阶段驱动通用动画器：`attackPhases` 相邻阶段末姿态链式插值（`phaseEndPose` 按阶段名解释 animConfig）；无阶段信息回退 `attackTotalProgress` 虚拟三阶段 |
| — | `src/entity/character/appearance/animators/attack/` | 不存在——阶段动画由 `attackingAnim` 数据驱动（见 6.3） |
| 修改 | `src/entity/character/physics/world.ts` | 传递 `phaseIndex`/`phaseTimer`/阶段序列给外观系统；更新 executor 调度；`setPlayerAttack(idx, holdDuration)` 蓄力脉冲与起手守卫解析；test_weapon 装配特判 |
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

## 十一、测试覆盖清单

> 测试框架：Vitest。测试文件命名为 `<被测模块>.test.ts`，与被测源文件同目录。测试使用 `DT = 1/60` 固定帧步长、内联 mock 工厂函数、帧进辅助函数和 `it.each()` 参数化测试。物理行为测试由 `entity/character/physics/harness.ts` 提供真实 rapier 世界的逐帧推进夹具。

### 11.1 阶段配置与曲线 — `character/combat/attack_phases.test.ts`

| 覆盖点 | 验证方式 |
|--------|----------|
| `applyEasing` 曲线性质 | 端点恒等、单调不减、ease_out 前快后慢 |
| `strikeCurve` 打击曲线 | 端点恒等、单调不减、峰值处曲线与速度连续、速度峰值位于 `strikePeakRatio`（峰值前加速、峰值后减速） |
| 阶段预设完整性 | 全部预设（近战链段 + `RANGED_PHASE_PRESETS`）的 `durationRatio` 之和为 1；阶段名 / `attackType` / `easing` 是合法枚举成员；`strikePeakRatio` ∈ (0,1]、`overshootRatio` ∈ [0,1) |
| 回退兼容 | `resolvePhases(undefined)` 返回单阶段回退（strike、ratio 1、移速 0.3） |
| 近战链段约束 | 每武器 4 段齐全（strike + recovery 两段式）；recovery 时长取 `config.recovery` 不参与分摊；段动作类型（轻1 竖斩 / 轻2 直刺 / 重1 横斩 / 重2 斜劈）；`swingTilt` 段固有确定性；动作阶段按 `durationRatio` 从动作时间分摊；段总时长 = 动作 + 恢复 |

### 11.2 技能/武器配置 — `melee_skill.test.ts` / `ranged_skill.test.ts` / `melee_weapon.test.ts` / `ranged_weapon.test.ts`

| 覆盖点 | 验证方式 |
|--------|----------|
| 预设完整性 | 每武器 4 段共 24 个近战预设；远程 9 技能；id 与 key 匹配；type 正确 |
| 三计时属性 | 轻段动作 0.2s + 恢复 0.2s、重段 0.3s + 0.2s；普通攻击冷却全为 0；远程 duration 排序约束（如 dart 最短、grenade 最长） |
| 连段装配 | `buildMeleeSkillSlots` 产出 4 槽 [轻1, 重1, 轻2, 重2]；槽 0/1 为起手槽；循环链闭合（轻1↔轻2、重1↔重2）；链指向的 skillId 均存在于本武器槽内；重段伤害 = 轻段 × 1.6；全部近战武器可装配出闭合双链 |

---

### 11.3 状态机 — `character/state_machine/machine.test.ts`

describe 区块：连段守卫（test_weapon 蓄力/方向组合键）、平地移动、斜坡 falling 判定、falling 行为、攻击/冲刺在陡坡结束、斜坡防滑、跳跃、输入缓冲连段（轻/重双链）、受击硬直与保护窗口。

| 覆盖点 | 验证方式 |
|--------|----------|
| 阶段推进 | 进入 attacking 时 `phaseIndex`/`phaseTimer` 归零；`phaseTimer >= phaseDuration` 推进阶段；全部阶段完成且总时长满足后 transition 退出 |
| 输入缓冲连段 | 最终阶段完整播完才消费缓冲；同键组续链免冷却、异键组切链需起手槽冷却；攻击中按输入逐帧重求守卫（中途改键/改方向 = 切链/换变体） |
| flinching | 攻击中被击中（`pendingFlinch`）立即中断攻击进入 flinching；硬直播完按支撑/输入转换；退出挂 `FLINCH_IMMUNITY_DURATION` 保护窗口；dying 优先级高于 flinching |
| 守卫集成 | `holdAtLeast`/`holdLessThan` 点按长按分流、方向组合键变体、键组分离（entryGroup） |

### 11.4 守卫解析 — `character/combat/combo_guard.test.ts`（19 用例）

守卫边界（holdAtLeast/holdLessThan 阈值、hasMoveInput/noMoveInput）、`evalComboGuard` 无守卫兜底、起手解析（`resolveEntrySkillIndex`：变体优先于兜底、冷却回退、键组内全冷却 → -1）、链下一段（`resolveChainNextIndex`：方向变体/兜底/无链 → -1）、键组映射（`chainGroupOf`）；夹具为 `test_weapon` 6 槽守卫链（蓄力/点按/重键组/方向变体/循环链/无链单发）。

### 11.5 伤害判定几何 — `entity/character/combat/obb.test.ts` / `melee_executor.test.ts`

OBB 构造与 15 轴 SAT 相交；攻击检测箱（`attackDetectOBB` / `testAttackDetect`）；武器命中箱判定（`testMeleeHit`）。

### 11.6 地面检测 — `character/state_machine/ground.test.ts`

`isSupportedOn` / `shouldFall` / `projectToSlope` / `applySlopeAntiGravity`。

### 11.7 物理行为 — `entity/character/physics/*.test.ts`

`harness.ts` 提供真实 rapier 世界夹具（`createHarnessWorld` / `tick` / `tickMulti`）：斜坡行走（`slope.test.ts`）、挤压弹出与推挤阻断（`squeeze_eject.test.ts`）、角色分离与斜坡补偿（`separation.test.ts`）、地面状态机（`ground_state.test.ts`）、质量配置（`mass.test.ts`）、面板信息（`panel_info.test.ts`）。

### 11.8 AI — `entity/character/ai/ai.test.ts` / `ai/nav/nav.test.ts`

双层 FSM 转移、静止检测（stall 恢复/交火豁免）、接敌冷却、追击活动半径、导航 stuck 倒退逃逸等。
