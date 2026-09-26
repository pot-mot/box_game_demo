# 攻击系统文档（武器攻击链 / 段子状态 / 动画 / 中断）

> 攻击动作的关节/朝向/调优提示词模版见 [`bone_animation/动作设计规范.md`](bone_animation/动作设计规范.md)。

## 一、整体架构

攻击系统由三层协作完成一次武器攻击的完整生命周期：

```
武器模组层（character/weapon/）
  └─ WeaponAttacks（武器固有数据，见 attack_chain.ts）
       ├─ chains: {light, heavy}       ← 每个攻击键的起手候选 entries + 主干段顺序 steps
       └─ segments: Record<string, AttackSegment>
            ├─ duration: 动作时间（不含恢复）
            ├─ recovery: 恢复时间（后摇，0 = 无恢复段）
            ├─ cooldown: 冷却时间（普通攻击 = 0；非 0 时从段触发时刻计时，只挡起手）
            ├─ phases: readonly AttackPhase[]   ← 阶段序列（仅时序/移速/可中断）
            ├─ damageMultiplier                 ← 伤害倍率
            └─ next: readonly AttackTransition[] ← 本段播完后的下一状态候选（连段唯一来源）

  段动画（character/weapon/attack_clip_data.ts）
  └─ 段 id → 稀疏骨骼关键帧 clip（三段式：起手 / 打击完成 / 收招戒备；轨道插值 strike_peak + hitbox 事件轨）

角色状态机层（character/state_machine/）
  └─ attacking meta-state（段子状态调度器，states/attacking/index.ts）
       ├─ 起手解析：machine.ts 在进入 attacking 时用 resolveEntrySegment 定下首个 activeSegment
       ├─ 每帧推进段子状态：states/attacking/segment.ts 推进阶段时间线 + 求值段的下一状态切换函数
       │    ├─ 同键 → 本段 next 转换（守卫变体优先）
       │    └─ 异键 → 该键起手解析
       └─ 按 key = "attacking_{segmentId}_{phaseName}" 查 phaseHandlerRegistry
            ├─ 找到 → 委托阶段专用 StateHandler 的 update
            └─ 未找到 → 默认阶段行为（按 moveSpeedMultiplier 缩放移动 + 斜坡投影/防滑）

动画表现层（entity/character/appearance/）
  └─ AppearanceSystem（clip 调度器，system.ts）
       └─ attacking 状态按当前段 id 取攻击动画 clip：
            ├─ getAttackClipById(segment.id)  ← attack_clip_data.ts 的显式骨骼关键帧
            └─ 动画键 = `attacking:{segment.id}`，段切换即触发快照混合
```

**关键**：攻击动作的玩法数据真源是**武器模组的攻击链**——段定义（时长 / 恢复 / 阶段时序 / 伤害倍率 / 冷却 / next 转换）全部由武器模组声明，角色实体只持有装备武器与数值覆写；**动画不再由抽象参数生成**，而是段 id 对应的显式骨骼关键帧数据（`attack_clip_data.ts`，由骨骼动画系统播放），无 per-phase animator、无动画参数。连段不再是状态机持有的索引，而是**段自身声明的 `next` 转换**，`attacking` 因此成为一个段子状态机（调度 + 消费缓冲，不退出状态即可推进下一段）；起手统一由 `resolveEntrySegment` 解析（声明顺序 = 优先级：守卫变体在前、兜底在后）；阶段特定逻辑通过 `registerPhaseHandler` 按 `attacking_{segmentId}_{phaseName}` 命名约定运行时注入（当前生产武器全部走默认行为）。

---

## 二、攻击阶段数据模型

### 2.1 阶段类型定义

**文件**：`src/character/combat/attack_phases.ts`

```ts
/** 攻击阶段名（具体段的阶段序列由武器模组声明，见 weapon/melee_attacks.ts / ranged_attacks.ts） */
export const ATTACK_PHASES = ['windup', 'strike', 'recovery', 'spin', 'draw', 'aim', 'release'] as const
export type AttackPhaseName = typeof ATTACK_PHASES[number]

/** 攻击阶段配置（仅玩法时序与中断语义；动画是段 id 的显式骨骼关键帧数据） */
export interface AttackPhase {
    /** 阶段名，构成阶段子状态 key "attacking_{segmentId}_{name}" */
    readonly name: AttackPhaseName
    /** 占动作时间的比例（0-1），动作阶段（非 recovery）比例之和应为 1；
     *  recovery 阶段不参与分摊，时长直接取所属段的 recovery */
    readonly durationRatio: number
    /** 移速倍率：0 = 完全定身，1 = 全速移动 */
    readonly moveSpeedMultiplier: number
    /** 是否可被 dash / jump 打断（combo 输入走段末缓冲，不受此限制） */
    readonly cancellable: boolean
}
```

> 动画不再由抽象参数表达：`AttackAnimConfig` / `ArmAnimConfig` / `EASING_TYPES` / `ATTACK_TYPES` 以及 `easing` / `strikePeakRatio` / `overshootRatio` / `attackType` / `twoHanded` / `swingTilt` 已全部移除。每个攻击段的动画是**显式骨骼关键帧数据**（`character/weapon/attack_clip_data.ts`，段 id 为键），由骨骼动画系统播放（见第六节）。

### 2.2 阶段解析

```ts
// character/state_machine/states/attacking/index.ts
/** 阶段子状态 handler 注册表 — 外部通过 registerPhaseHandler 注入 */
export const phaseHandlerRegistry = new Map<string, StateHandler>()

export const registerPhaseHandler = (key: string, handler: StateHandler): void => {
    phaseHandlerRegistry.set(key, handler)
}

// attackingHandler.update 内（segment = c.activeSegment，武器模组持有的段定义）：
const phases = resolvePhases(segment.phases)
const phaseKey = c.phaseIndex < phases.length
    ? `attacking_${segment.id}_${phases[c.phaseIndex].name}`
    : undefined
const phaseHandler = phaseKey ? phaseHandlerRegistry.get(phaseKey) : undefined
// 找到 → 委托 update（stateTime = phaseTimer、attackPhase = 阶段名）；
// 未找到 → 默认阶段行为（moveSpeedMultiplier 缩放 + 斜坡投影/防滑）
```

### 2.3 时间模型（三计时属性）

段计时器由三个属性表达：**动作时间 `duration` + 恢复时间 `recovery` + 冷却时间 `cooldown`**，三者都是**段（`AttackSegment`）自身的属性**（不再挂在技能配置上）。段总时长 = `duration + recovery`；普通攻击（近战链段 / 远程预设）`cooldown = 0`，节奏完全由动作/恢复时间形成；冷却机制保留给特殊技能与数值覆写（如 test_weapon 的蓄力段），非 0 时从**段触发时刻**开始计时、只挡起手。

单阶段时长由 `phaseDurationOf(phase, segment.duration, segment.recovery)` 计算：

```ts
/* recovery 阶段取段的 recovery；其余动作阶段按 durationRatio 从段的 duration 分摊 */
export const phaseDurationOf = (phase: AttackPhase, duration: number, recovery: number): number =>
    phase.name === 'recovery' ? recovery : duration * phase.durationRatio
```

```
近战轻段：duration = 0.267s，recovery = 0.266s，段总时长 0.533s
├─ strike:   durationRatio = 1 → 实际时长 0.267s（= duration）
└─ recovery: durationRatio = 0 → 实际时长 0.266s（= 段的 recovery，ratio 不参与）

每个阶段内的 phaseProgress = phaseTimer / phaseDurationOf(...)
总进度 totalProgress = attackTimer / (duration + recovery)
```

**未定义 phases 时**自动生成单阶段回退：`[{name: "strike", durationRatio: 1, moveSpeedMultiplier: 0.3, cancellable: false}]`，行为与重构前完全一致。

---

## 三、武器攻击链与连段（段子状态 next 转换 + 输入缓冲）

### 3.1 攻击链数据模型

**文件**：`src/character/weapon/attack_chain.ts`

攻击动作由**武器模组拥有**：一把武器 = 一张攻击链（`WeaponAttacks`），内含段定义索引与轻/重两个攻击键的链。连段关系不用「槽位下标 / comboChain 字符串列表」表达，而是**写在段自己身上**——每段的 `next` 声明「本段播完后可进入哪些段」，按声明顺序求值，第一个守卫通过者胜出。

```ts
/** 攻击键组（输入侧语义，与槽位下标无关） */
export const ATTACK_KEYS = ['light', 'heavy'] as const
export type AttackKey = typeof ATTACK_KEYS[number]

/** 攻击段：武器模组拥有的一次可播放动作的玩法数据（id 同时是动画键、清单键与关键帧数据键） */
export interface AttackSegment {
    readonly id: string                 /* 段 id（武器内唯一，形如 `{weaponId}_{key}_{step}`） */
    readonly key: AttackKey             /* 所属攻击键 */
    readonly step: number               /* 链内序号（1-based） */
    readonly duration: number           /* 动作时长（秒，不含恢复段） */
    readonly recovery: number           /* 恢复时长（秒，0 = 无恢复段） */
    readonly phases: readonly AttackPhase[]  /* 阶段序列（仅时序）；recovery 阶段时长取本段 recovery */
    readonly damageMultiplier: number   /* 伤害倍率（相对武器基础伤害） */
    readonly cooldown: number           /* 冷却（秒，0 = 无冷却；从段触发时刻计时，只挡起手） */
    readonly next: readonly AttackTransition[]  /* 段播完（含恢复段）后的下一状态候选；空数组 = 链终止 */
    readonly label?: string             /* 显示名覆写（条件变体段用，如「蓄力重劈」） */
}

/** 段转换：to = 目标段 id；按声明顺序求值，guard 缺省 = 无条件 */
export interface AttackTransition {
    readonly to: string
    readonly guard?: AttackTransitionGuard
}

/** 起手候选（声明顺序 = 优先级：守卫变体在前、兜底在后） */
export interface AttackEntry {
    readonly segmentId: string
    readonly guard?: AttackTransitionGuard
}

/** 单个攻击键的链 */
export interface WeaponAttackChain {
    readonly key: AttackKey
    readonly entries: readonly AttackEntry[]  /* 起手候选 */
    readonly steps: readonly string[]         /* 主干段顺序（HUD/清单/展示按此枚举；纯条件起手变体段不入列） */
}

/** 全套攻击链（武器模组固有数据） */
export interface WeaponAttacks {
    readonly chains: Readonly<Record<AttackKey, WeaponAttackChain>>
    readonly segments: Readonly<Record<string, AttackSegment>>
}
```

**解析规则**：

- **起手 `resolveEntrySegment(attacks, key, ctx, currentSegmentId?)`**：该攻击键的起手候选按**声明顺序**取第一个「守卫通过 + 冷却就绪」的段；`currentSegmentId` 用于排除自身（攻击中重复按同键不应重启本段）；无候选 → `undefined`。`idle` / `walking` 的攻击转换 guard 与 `world.ts setPlayerAttack` 都经 `canStartAttack(combat, input)` 复用它判定。
- **段转换 `resolveNextSegment(attacks, segment, ctx)`**：本段 `next` 候选按声明顺序取第一个守卫通过者；无候选 → `undefined`（链终止，段播完后正常退出 attacking）。
- **声明顺序 = 优先级**：带守卫的条件变体必须声明在同组兜底段之前；变体冷却中会自动回退到兜底候选（两者冷却相互独立）。
- **冷却只挡起手**：段触发即挂自身冷却，链内推进不查冷却，因此普通攻击（冷却恒 0）不受任何阻塞。

**段清单顺序 `orderedSegments(attacks)`**：按攻击键分组枚举——每键先按 `steps` 主干顺序（同链 1、2… 段相邻），再补该键其余段（条件起手变体接在所属键末尾）；键序为轻 → 重。近战因此得到「轻1 → 轻2 → 重1 → 重2」。HUD 面板、展示模式脚本与骨骼动画编辑模式内置动作库共用这一枚举顺序。

### 3.2 近战段：每武器 4 个主干段（示例）

**文件**：`src/character/weapon/melee_attacks.ts`（模板） + `src/character/weapon/melee_weapon.ts`（预设装配）

近战段由 `buildMeleeAttacks(weaponId, options)` 装配，段 id = `{weaponId}_{模板键}`，模板键为 `light_1` / `light_2` / `heavy_1` / `heavy_2`。**下表是短剑示例**（数值目前是近战全局常量：轻 = 动作 0.267s + 恢复 0.266s、重 = 动作 0.4s + 恢复 0.267s、重段伤害倍率 ×1.6；为原节奏的 0.75 倍速）：

| 段 id | 攻击键 | 动作 | strike 时长 | recovery | 伤害倍率 | next |
|---|---|---|---|---|---|---|
| `{weapon}_light_1` | light | 上至下竖劈 | 0.267s | 0.266s | 1 | `{weapon}_light_2` |
| `{weapon}_light_2` | light | 探身直刺 | 0.267s | 0.266s | 1 | `{weapon}_light_1` |
| `{weapon}_heavy_1` | heavy | 横向挥砍 | 0.4s | 0.267s | 1.6 | `{weapon}_heavy_2` |
| `{weapon}_heavy_2` | heavy | 斜向挥砍 | 0.4s | 0.267s | 1.6 | `{weapon}_heavy_1` |

- **起手**：轻击键 → `light_1`、重击键 → `heavy_1`（均为无守卫的单一候选，普通攻击恒定可起手）。
- **连段**：`light_1 ↔ light_2`、`heavy_1 ↔ heavy_2` 各自成循环链（持续输入无限循环），全部由段的 `next` 声明；`next` 无守卫，因此同键按住即循环。
- **段冷却全为 0**：节奏由动作 + 恢复时间自然形成。
- **动作形态**（挥砍/直刺/方向、双手幅度等）不再是参数，而是各段 id 的**显式骨骼关键帧**（`attack_clip_data.ts`）；武器间差异直接体现在关键帧数据中。

### 3.3 远程段：每武器单段

**文件**：`src/character/weapon/ranged_attacks.ts`

远程武器各持 1 个主干段（`buildRangedAttacks(weaponId)`），段 id 沿用原远程技能 id（如 `longbow_shot`、`throwing_dart_fling`），`key = 'light'`、`recovery = 0`、`next = []`（单发，无连段）；重击链为空链（`entries` / `steps` 均为空数组，起手解析恒失败）。轻击键起手，播完段即收招。

**弹丸在 `release` 阶段开始的那一帧发射**（`ranged_executor.update`：`activePhaseName === 'release'` 且本段未发射；每段只发射一次）：先拉弓 / 举枪 / 后引，动画走到释放帧才出弹，弹道与武器朝向一致。飞镖段只有 `release` 阶段，等价于起手即甩出。

阶段序列按武器语义声明：弓箭为 `draw / aim / release`，弩与枪械为 `aim / release`，投掷类（飞斧 / 手雷 / 燃烧瓶）为 `windup / release`，飞镖为单 `release`。多数阶段 `cancellable: true`（瞄准期可被 dash 打断），释放段不可打断。

**若要为远程武器组连段**（如三连射、蓄力-释放两段）：在该武器的 `buildRangedAttacks` 里追加段定义并填写 `next`（可选守卫 `holdAtLeast` 等），段末推进逻辑无需任何改动。

### 3.4 守卫与上下文（触发条件：蓄力 / 方向组合键 / 冷却）

守卫决定「起手候选与段转换何时成立」，典型场景：同键点按 vs 长按（蓄力攻击）、攻击 + 方向组合键触发不同变体、跨链切段时目标段是否已就绪。守卫原语与上下文都在 `src/character/weapon/attack_chain.ts`（原 `combat/combo_guard.ts` 已删除）。

```ts
/** 段转换求值上下文（状态机每帧构造）：输入侧信息 + 段冷却查询，守卫不直接触碰实体/物理 */
export interface AttackTransitionContext {
    readonly dx: number           /* 移动输入方向 */
    readonly dz: number
    readonly holdDuration: number /* 攻击键按住时长（秒），区分点按/长按 */
    readonly attackKey: AttackKey | undefined /* 本帧按下的攻击键（undefined = 无攻击输入） */
    readonly cooldownRemaining: (segmentId: string) => number /* 查询某段剩余冷却（秒，<= 0 = 就绪） */
}
export type AttackTransitionGuard = (ctx: AttackTransitionContext) => boolean

/* 守卫原语 */
always                        /* 无条件通过（兜底转换的显式写法） */
pressedKey(key)               /* 按下指定攻击键 */
pressedOtherKey(key)          /* 按下非指定攻击键（切链用） */
holdAtLeast(seconds)          /* 长按（蓄力） */
holdLessThan(seconds)         /* 点按 */
hasMoveInput                  /* 有方向输入（攻击 + 方向组合键） */
noMoveInput                   /* 无方向输入 */
cooldownReady(segmentId)      /* 目标段冷却就绪（跨链切段 / 重新起链） */
allOf(...guards)              /* 组合：全部通过 */
anyOf(...guards)              /* 组合：任一通过 */
not(guard)                    /* 取反 */
```

上下文由 `combat/attack_runtime.ts` 的 `attackContextOf(c, input)` 构造（`cooldownRemaining` 读 `combat.segmentCooldowns`）；该模块同时提供 `segmentCooldownRemaining` / `armSegmentCooldown` / `tickSegmentCooldowns` 与 `canStartAttack`。

**键组模型**：输入侧按下的攻击键是 `attackKey: 'light' | 'heavy'`（`CharacterInput.attackKey`，取代原 `skillIndex` 数字槽号）；段通过自身 `key` 字段归属键组，`chains` 按 `AttackKey` 索引。守卫里的键判定用 `pressedKey` / `pressedOtherKey`。

**蓄力攻击（按住计时，松开判定）**：计时在输入侧完成，状态机无计时器——

1. `modes/play/camera.ts`：攻击键 mousedown 记录 `performance.now()`，mouseup 时算出按住秒数随回调传出（右键重击同为松开触发；blur/contextmenu 取消）；
2. `world.ts setPlayerAttack(attackKey, holdDuration)`：把按住时长存入脉冲，经 `setInput` 第 6/7 参喂入 `CharacterInput.attackKey` / `attackHoldDuration`，帧末与脉冲一同归零；
3. 起手候选声明顺序 = 优先级：`holdAtLeast(阈值)` 的蓄力段在前、无守卫的兜底段在后；守卫不通过或蓄力段冷却中时自动落到兜底段。

**测试武器 `test_weapon`**（`src/character/combat/test_weapon.ts`，仅供单元测试，不进 `MELEE_WEAPON_PRESETS`；经 `catalog.ts` 的 `registerWeaponPreset` 注册为额外预设）：6 段覆盖蓄力起手（`charge`，起手守卫 `holdAtLeast(TEST_WEAPON_CHARGE_HOLD = 0.5)`）、点按兜底（`tap`，同键无守卫候选）、键组分离（`heavy_1` / `heavy_2` 独立重击链）、方向变体（`tap` 的 `next` = [`thrust`（守卫 `hasMoveInput`）, `light_2`（兜底）]）、循环链（`tap ↔ light_2`、`heavy_1 ↔ heavy_2`）与无链单发（`charge.next = []`）。**冷却保留非 0 值作为冷却机制验证夹具**（charge 1.2s / tap 0.3s / heavy_1 0.6s；普通攻击预设冷却均为 0）。装配入口：`world.ts` `weaponRuntimeOf` 对 `weaponId === TEST_WEAPON_ID` 特判 `createTestWeaponRuntime()`。

### 3.5 输入缓冲连段（段末推进）

`CombatComponent` 运行时状态（段以定义对象表达，不再有槽位索引）：

```ts
/** 当前攻击段（attacking 期间有效；未攻击时 undefined） */
activeSegment: AttackSegment | undefined
/** 缓冲的下一段（段播完由段转换 / 异键起手解析消费） */
bufferedSegment: AttackSegment | undefined
/** 段冷却剩余（秒）：段 id → 剩余时间（仅非 0 冷却的段写入） */
readonly segmentCooldowns: Map<string, number>
```

推进流程（`states/attacking/index.ts` + `states/attacking/segment.ts`）：

```
attacking update(dt):
  ├─ advanceSegmentPhases(c, dt)：阶段照常推进（strike → recovery），累计 attackTimer / phaseTimer
  ├─ input.attack 为真 → resolveSegmentNextState(c, activeSegment, input) 写缓冲：
  │    ├─ 同键（input.attackKey === 当前段 key）→ resolveNextSegment：本段 next 候选按守卫取第一个通过者
  │    ├─ 异键 → resolveEntrySegment(attacks, 异键, ctx, 当前段 id)：该键起手解析（守卫 + 冷却），不切到自身
  │    └─ 未按攻击键 → 不缓冲（新输入逐帧覆写旧缓冲 = 中途改键/改方向换变体）
  ├─ 阶段全部播完（含 recovery）&& 缓冲存在
  │    → enterAttackSegment(c, bufferedSegment, entity)：重置 attackTimer/phaseIndex/phaseTimer/attackedTargets，
  │      段触发即挂自身冷却（普通攻击冷却 = 0 不挂），唤醒刚体，
  │      **不出 attacking 状态**（链内推进不查冷却）
  └─ 无缓冲 → 段播完后正常走 transition 退出（冷却已在各段触发时挂上，exit 不补挂）
```

`enterAttackSegment` 是段切换的唯一入口（进入 attacking 时由 `machine.ts` 先完成起手解析写入 `activeSegment`，再由此初始化段子状态）。

**玩家侧**：`world.ts` `setPlayerAttack(attackKey, holdDuration)` 攻击中不再拒绝，写单帧脉冲（含攻击键与按住时长）经 `input.attack + attackKey + attackHoldDuration` 由上述解析消费；未攻击时先用 `canStartAttack` 判定（键组内守卫变体与兜底段冷却独立，不能只查单个段冷却），无候选则返回 `'cooldown'`。**HUD 展示**：`modes/play/index.ts` 按 `orderedSegments(player.combat.attacks)` 每段一行，同行展示动作 / 恢复 / 冷却三个计时器（`skillTimers`，冷却读 `segmentCooldownRemaining`；SKILLS 区块首行是冲刺技能）。**AI 侧**：AI 各战斗状态守卫用 `canStartAttack(combat, {..., holdDuration: 0, attackKey: 'light'})` 判断能否出招，出招后持续 `setInput(..., attack=true)` → 缓冲恒有值，自动无限走轻链，无需感知链结构（AI 不蓄力，holdDuration 恒 0 → 命中兜底段）。

### 3.6 确定性挥砍方向

每段动作的方向（竖劈 / 横斩 / 斜劈的倾斜角）已**烘焙进该段的骨骼关键帧**（含武器骨骼与刃面偏转），同段每次播放方向一致；运行时不再有 `swingTilt` 参数或状态。

### 3.7 移动技能：冲刺（dash）

冲刺是**角色能力而非武器技能**（`src/character/combat/dash_skill.ts`）：`DashSkillRuntime` 持有 `DashSkillConfig`（id `dash`，`DASH_DURATION = 0.25s` 动作时间 / recovery = 0 / `DASH_COOLDOWN = 1.0s`）与 `cooldownTimer`，由 `createDashSkillRuntime()` 创建后挂在 `CombatComponent.dashSkill`。它**不参与起手解析、攻击链与执行器调度**（`WeaponAttacks` 里没有冲刺段）。运行时语义与攻击段一致：

- **冷却挡起手**：idle/walking/jumping/falling/attacking 的 `→ dashing` 转换守卫读 `combat.dashSkill.cooldownTimer <= 0`；`dashing.enter` 触发即挂 `config.cooldown`，由 `world.ts` 与段冷却同循环递减（`tickSegmentCooldowns` 与冲刺冷却各自递减）。
- **类型形态**：原通用的 `SkillSlot` / `SkillTimingConfig` 已随槽位模型移除，冲刺保留自身最小配置类型，攻击链路无需任何窄化。
- **HUD**：play 面板 SKILLS 区块首行展示 `dash`（动作格 = 冲刺期间状态机驻留时间，恢复格恒 `-`，冷却格同攻击段规则）。

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

**触发条件**：`CombatComponent.onDamageTaken` 回调中，若 `attackActive === true`（攻击中被击中）且 `flinchImmunityTimer <= 0`，设置 `combat.pendingFlinch = true`。

**受击保护窗口（防 stagger-lock）**：无限连段每段都会清空 `attackedTargets` 反复命中同一目标，若每次命中都能触发硬直，被击方每次重新起攻都会被下一击打断，永久锁在受击状态。因此 `flinching.exit` 挂 `flinchImmunityTimer = FLINCH_IMMUNITY_DURATION`（0.5s，> 轻链段间隔 0.4s），窗口内伤害照常结算但不再触发新硬直，保证被击方至少一个完整的反击/脱身窗口；计时器由 `world.ts` 主循环逐帧递减。

**flinching 状态行为**：

| 方法 | 行为 |
|------|------|
| `enter` | `attackActive = false`，`pendingFlinch = false`，`bufferedSegment = undefined`，阶段计时归零，速度归零（打断时非 0 冷却已在段触发时挂上并继续计时；普通攻击无冷却不受影响） |
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
- 链内推进（本段 `next`）免冷却；普通攻击（近战段 / 远程预设）冷却恒 0，节奏由动作/恢复时间形成；特殊段（如 test_weapon 蓄力段）的非 0 冷却从段触发时开始计时，只挡起手不惩罚链中段
- 中途改按另一攻击键 = 段末切链（需该键起手候选守卫通过且冷却完毕，普通攻击恒满足）

### 4.3 Dash / Jump 取消（自中断）

- 仅在 `cancellable === true` 的阶段，dashing / jumping 的 transition guard 可以通过
- attacking meta-state 在 exit 时清理（冷却已在段触发时挂上、`bufferedSegment`/阶段计时重置）

### 4.4 状态转移图

```
                     ┌─→ flinching (受击，所有状态) ─→ idle/walking/falling
                     │
idle/walking ──→ attacking (段子状态机)
                     │
                     │  段推进：当前段阶段0(cancellable) → 阶段1 → … → recovery
                     │       │
                     │   攻击输入?（任意时刻）→ 写缓冲；段播完后按段的 next 转换推进下一段（不退出 attacking）
                     │   dash/jump?（仅 cancellable 阶段）
                     │   → dashing/jumping
                     │
                     └─→ walking/idle/falling/jumping (段播完且无缓冲 / 链终止)
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
- **运行时**：命中窗口由攻击 clip 的事件轨驱动（`hitbox_on` ≈ 0.5×动作时间、`hitbox_off` ≈ 0.95×动作时间，与打击帧对齐，见 6.3），窗口内每帧强制 `weaponGroup.updateMatrixWorld()`，取 `matrixWorld.elements` 经 `obbFromTransform`（列主序，列向量含缩放）得世界 OBB。伤害 = `weapon.damage × activeSegment.damageMultiplier`（重段 ×1.6）。
- **判定**：与目标受击箱 OBB 做 15 轴 SAT 相交（`combat/obb.ts` `obbIntersect`）。判定与 debug 可视化（`combat_vfx/hitbox_debug.ts` `syncWeaponDebugBox`）同源。

### 5.2 受击箱

与身体碰撞箱同尺寸（竖直胶囊包围盒 = `CHARACTER_BASE_SIZE` × `scale`），中心 = body 位置，随身体朝向 yaw 旋转（`targetHurtOBB`）。攻击判定与 AI 攻击检测共用同一受击箱。

### 5.3 命中结算

SAT 相交命中且目标不在 `attackedTargets`（每段攻击只结算一次）→ `applyDamage` + 击退冲量（方向 = 武器握把 → 目标的水平方向）+ `onHit` 回调（顿帧/相机震动等打击感）。击退方向以武器握把世界位置为起点（`weaponGroup.getWorldPosition`）。

### 5.4 投掷物（子弹）碰撞与可穿过类别

**文件**：`src/entity/character/combat/ranged_executor.ts`

子弹自身是 `mask 0` 的 sensor（不与任何物体产生物理交互），命中判定完全由每帧的显式检测完成，因此「命中什么会消失」由数据驱动：

- **配置字段**：`RangedWeaponConfig.passThroughCategories?: readonly CollisionCategory[]`。默认值 `DEFAULT_BULLET_PASS_THROUGH_CATEGORIES = ['area']`（`character/weapon/ranged_weapon.ts`），即**默认只穿过水域**；命中其它类别（`box` / `fragment` / `terrain` / `ground` / `character`）子弹立即消失。
- **类别系统**：`src/physics/collision_category.ts`。类别（`ground` / `box` / `fragment` / `area` / `terrain` / `character`）以 membership 位（第 5 位起，避开交互组 1/2/4/8/16）并入碰撞体的 `collisionGroups`，经 `categoryCollisionGroups(group, mask, category)` 打包；类别位不参与交互（其它碰撞体的 filter 均不含这些位），仅用于查询侧识别。
- **数值编译**：命中判定用位掩码，`passThroughCategories` 在开火时编译为 `passThroughMask`（逐帧 O(1)）。
- **场景几何（箱子 / 碎片 / 地形 / 世界地面）**：每帧用 `world.castShape` 扫描「上一帧位置 → 当前位置」整段位移（`maxToi = 1`、初始穿模即判定），因此高速子弹不会穿过薄碰撞体。扫描用 `filterPredicate` 放行可穿过类别，其余已标注类别的碰撞体一律阻挡；爆炸子弹（`explosionRadius > 0`）在**命中点**就地引爆后消失。
- **角色**：沿用宽容半径判定（`BULLET_HIT_RADIUS`，覆盖受击箱 + 一帧位移），不参与形状扫描。命中角色即消失；仅 `attackTendency` 判定为敌对时结算伤害 / 击退 / 爆炸——**非敌对角色同样会挡下子弹（不结算伤害）**。把 `character` 加入 `passThroughCategories` 则该武器对所有角色完全透明（穿过且不结算伤害，即「幽灵弹」；带伤害的贯穿弹属未实现能力）。
- **兜底路径**：生命期耗尽、坠出世界（`y < -10`）、爆炸子弹掉到地面以下（`y < 0`，正常已被地面扫描拦下）、命中后速度 < 1，均沿用原有消失逻辑。
- **未标注类别的碰撞体**（武器、其它子弹）不阻挡子弹；未显式声明碰撞组者 membership 全 1，按声明顺序解析为 `ground` → 阻挡（fail-closed）。
- **世界级清理**：子弹是战斗期临时对象，既不是实体系统的实体也不进存档。编辑模式 Reset 还原世界、`Ctrl+O` 载入存档时，由 `main.ts` 的 `clearWorld()` 调用 `CharacterEntitySystem.clearBullets()`（→ `rangedExecutor.clear()`）连同物理刚体与场景 mesh 一并清除，避免旧子弹残留到还原后的世界里继续飞行。

---

## 六、动画系统（骨骼 clip 化，M4 迁移后）

> 攻击动画已迁移至骨骼动画系统（`docs/bone_animation_system.md`）：原 `animators/` 目录全部删除，动画是**显式骨骼关键帧数据**（不再有参数生成器），命中窗口由动画事件轨道驱动。

### 6.1 动画文件组织

```
character/weapon/
├── attack_clip_data.ts    ← 攻击段基础骨骼关键帧（段 id → 稀疏关键帧）
└── attack_pose_edits.ts   ← 逐段关键姿势修订（不改变时长、阶段或事件）
entity/character/appearance/
├── pose_fns.ts            ← 基础状态姿态纯函数（固定频率采样）
├── clips/
│   ├── base_clips.ts      ← 基础状态 clip 生成器（60fps 烘焙，循环 wrap/非循环 clamp，weaponHeld 变体）
│   ├── attack_clips.ts    ← 攻击 clip 解析（段 id → clipFromJSON，惰性缓存）
│   └── *.test.ts
├── skeleton_bridge.ts     ← 角色模型 Group ↔ 骨架桥接（领域 FK 缓存为唯一世界变换源）
└── system.ts              ← clip 调度器（动画键 → 播放器 → 快照加权混合）
```

### 6.2 动画调度

`AppearanceSystem`（`system.ts`）为 clip 调度器：

- **动画键**：基础状态 `${state}:${weaponHeld?'w':'n'}`；attacking 用当前段 id（`attacking:${segment.id}`），链段切换即触发快照混合。
- **快照加权混合**：状态/键切换瞬间抓取全部关节快照，新 clip 采样输出 × w + 快照 × (1−w)（w 三次 ease-out，`STATE_BLEND_DURATION`）。
- **桥接**：模型关节经 `createCharacterSkeletonBridge`（Group 层级自动建连）绑定为骨架，播放器 `applyPose` 写骨架 → 桥接写回 Group（场景图级联）。
- **三种持握模式**：单持（左手反摆）/ 双手共持（attacking 且 `holdMode === 'two_handed'` 且无副手武器时，左肩 IK 根 → 左手链每帧 `solveCcd` 追模型指定的 `supportGripOffset`，模型原点已校正到主握点，applyPose 先写、IK 后写，带肘极向约束）/ 双持（武器含 `offhandMesh`：左手握持自身武器，不走共享 IK，左右手分别由关键帧驱动）。
- **双持命中窗口按槽分组**：攻击 clip 事件带 `params.weapon: 'main' | 'offhand'`，`melee_executor.setHitWindow(active, weapon?)` 分别开关左右命中箱，两只手都结算伤害（每段每目标仍只结算一次）。

### 6.3 攻击动画数据（attack_clip_data.ts / attack_pose_edits.ts）

攻击姿势由两个显式资产组成：**`character/weapon/attack_clip_data.ts`** 提供基础稀疏关键帧，**`attack_pose_edits.ts`** 按段 id 覆盖指定现有关节/时间的姿势。修订在取 clip 时合并，不增加阶段、关键时序或每帧动画器。`AppearanceSystem` 在进入 attacking 与链段切换时按段 id 取 clip：

```ts
/* entity/character/appearance/clips/attack_clips.ts */
export const getAttackClipById = (clipId: string): BoneAnimationClip
```

- **关键帧时间** = 0 与各阶段边界（`phaseDurationOf` 累加）；姿态是显式关节旋转/位置，修订只覆盖基础轨道里已存在的关键时刻。**三段式约定**：t=0 起手/蓄力 → 中帧（动作段结束）= 打击完成姿态（刃/枪口位于打击平面内、双手副握点在左臂臂展内）→ 末帧 = 持械戒备（与 idle 一致）。挥砍平面与刃面朝向由武器骨骼（`rightWeaponMount` / `leftWeaponMount`）承担，收招帧回到 `WEAPON_GRIP_FLEX`。双持副手相位由原有关键帧表达。
- **事件轨**：`hitbox_on` ≈ 0.5×动作时间、`hitbox_off` ≈ 0.95×动作时间（对齐打击帧；驱动 `melee_executor.setHitWindow`，按 `params.weapon` 分主/副手）。
- **数据校验**：`attack_pose_edits.ts` 引用的关节轨道和时间必须在基础 clip 中存在；`getAttackClipById` 对缺失段 id 抛错（数据与武器段不同步）。事件轨和 clip 时长不受姿势修订影响。

### 6.4 AnimationContext 与段 id 动画键

`AnimationContext`（`entity/character/appearance/types.ts`）由 `world.ts` 每帧装配：

| 字段 | 类型 | 说明 |
|------|------|------|
| `stateTime` | `number` | 当前状态已用时间（秒） |
| `horizontalSpeed` | `number` | 水平速度（m/s）：行走步频变速、falling 腿张档位 |
| `twoHanded` | `boolean` | 当前武器是否双手持握（攻击态时左手链 IK 贴合主手武器） |
| `attackSegment` | `AttackSegment \| undefined` | 当前攻击段（仅 attacking 有效）—— 动画键（段 id）的来源 |
| `attackPhase` | `AttackPhaseName \| undefined` | 当前攻击阶段名 |
| `attackPhaseProgress` | `number` | 当前阶段进度 0-1（`phaseTimer / phaseDurationOf(...)`） |
| `attackTotalProgress` | `number` | 段总进度 0-1（`attackTimer / (duration + recovery)`） |
| `attackPhaseIndex` | `number` | 当前阶段索引（越界表示阶段已全部完成） |
| `weaponHeld` | `boolean` | 是否持有武器（idle/walking 据此降低持械臂摆幅） |

动画键（`system.ts` 的 `update`）：attacking 且 `attackSegment !== undefined` 时为 `attacking:{segment.id}`；基础状态为 `${state}:${weaponHeld?'w':'n'}`；falling 附加速度档 `falling:{tier}:{w|n}`。**键变化即触发一次 `onStateChange`**：抓取当前关节快照、按新段 id 取 clip 并 seek(0)，随后快照加权混合收敛（`STATE_BLEND_DURATION`），因此链段切换在视觉上是连续过渡而非硬切。

### 6.5 动作形态

每个攻击段的形态由基础 clip 与该段显式姿势修订共同定义，不使用抽象动作参数。调整动作时修改 `attack_pose_edits.ts` 中具体段、具体时间、具体关节的关键姿势；调整关键帧结构时再修改 `attack_clip_data.ts`。基础状态（待机/行走/跳跃/…）仍由 `pose_fns.ts` 生成基础 clip（`base_clips.ts`）。

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

// entity/character/appearance/system.ts —— clip 调度器（CLIP_STATES 覆盖全部状态，
// 攻击动画按段 id 由 getAttackClipById 提供，不再有 AnimationHandler Record）
```

### 7.2 阶段子状态：运行时注册表

阶段子状态 key 为运行时字符串拼接（`attacking_${segmentId}_${phaseName}`），由 `states/attacking/index.ts` 的 `phaseHandlerRegistry: Map<string, StateHandler>` 存取，未命中即走默认阶段行为。注册入口仍为 `registerPhaseHandler(key, handler)`；原 `attack_phases.ts` 中的模板字面量推导类型 `AttackSubState` 已随技能 id 联合类型删除（武器段 id 是运行时字符串，不再有编译期联合可供推导）。

```ts
// character/state_machine/states/attacking/index.ts
export const phaseHandlerRegistry = new Map<string, StateHandler>()
export const registerPhaseHandler = (key: string, handler: StateHandler): void => { /* ... */ }

// update 内拼接（segment.id = 武器模组段 id）
const phaseKey = c.phaseIndex < phases.length
    ? `attacking_${segment.id}_${phases[c.phaseIndex].name}`
    : undefined
```

当前生产武器均未注册阶段 handler，全部走默认行为（见 8.2）。

### 7.3 判别式 Map 访问约定

当 `Map<Key, BaseType>` 的值在运行时是不同类型的子类时，可通过泛型映射类型 `Record<Key, SubType>` 配合 `as` 做一次集中窄化（见 AGENTS.md 类型系统第 4 条），后续所有下游访问均获得精确类型。这是通用代码约定，不限于状态机。

---

## 八、新增 / 调整攻击段与连段指南

> 一句话原则：**攻击动作是武器模组的数据，不是状态机的代码**。增删段、改链长、改循环、加条件变体，全部落在 `src/character/weapon/`；状态机、存档、AI、HUD、展示模式、骨骼动画内置库都会自动跟随。

### 8.1 三个可改点（改哪里）

| 想改什么 | 改哪里 |
|---|---|
| 某段动作时长/恢复/伤害倍率 | `melee_attacks.ts` 的段模板（`SEGMENT_META`：轻/重决定时长与伤害倍率） |
| 某段动作形态（挥砍/直刺幅度、双手、倾斜角…） | `character/weapon/attack_pose_edits.ts` 的逐段关键姿势；需要增删关键时刻时再编辑 `attack_clip_data.ts` |
| 某段阶段序列（strike/recovery 之外的新阶段、`moveSpeedMultiplier`、`cancellable`） | `melee_attacks.ts` 的 `segmentPhases()`（影响所有近战模板段）；单独一个段用 `extraSegments` 自带 `phases` |
| 链长度/顺序/是否循环 | `melee_weapon.ts` 里该武器 `meleePreset(base, attackOptions)` 的 `attackOptions.chains`（缺省 = `melee_attacks.ts` 的 `MELEE_CHAIN_SPECS`：轻/重各 2 段循环） |
| 起手条件（长按/方向变体/特殊技） | `attackOptions.extraSegments` + `attackOptions.entries`（守卫变体在前、兜底在后） |
| 段间条件续段 | 该段的 `next` 候选数组（守卫候选在前、兜底在后） |

武器间差异（动作幅度、双手持握等）直接体现在各武器段 id 的骨骼关键帧数据中（`attack_clip_data.ts`）；双手持握由武器数据的 `twoHanded` 声明。

### 8.2 完整流程 A：把巨剑轻链改成三段（轻 1 → 轻 2 → 轻 3）

**目标**：只有巨剑的轻击链变三段，其它武器保持两段；三段都参与循环、清单顺序为 轻 1 → 轻 2 → 轻 3 → 重 1 → 重 2。

1. **加段模板键**（`melee_attacks.ts`）
   - `MELEE_SEGMENT_KEYS` 追加 `'light_3'`；
   - `SEGMENT_META` 追加 `light_3: {key: 'light', step: 3, heavy: false}`；
   - 该模板键对**所有**近战武器可用，但只有把它写进某武器链编排的武器才会生成对应段（`buildMeleeAttacks` 只创建编排里用到的模板段）；
   - 新段的**动作形态**在骨骼动画编辑器中作者化，导出后并入 `attack_clip_data.ts`（键 = `{weaponId}_light_3`）。
2. **改该武器的链编排**（`melee_weapon.ts`）
   ```ts
   heavy_sword: meleePreset({...预设字段...}, {
       chains: {light: {steps: ['light_1', 'light_2', 'light_3'], loop: true}},
   }),
   ```
   `next` 由编排自动生成（轻 1 → 轻 2 → 轻 3 → 轻 1），无需手写；`loop: false` 则末段 `next: []`（播完收招）。
3. **验证**（本仓库已落地的断言）
   - 单测 `weapon/attack_chain.test.ts`：巨剑 `chains.light.steps` 为 3 段、`orderedSegments` 顺序为 轻1/轻2/轻3/重1/重2、`segmentDisplayName` 为「轻击三段」、段转换依编排推进；
   - 单测 `state_machine/machine.test.ts`：按住轻击键依次得到 `heavy_sword_light_1 → light_2 → light_3 → light_1`；
    - 单测 `modes/bone_edit/builtin_clips.test.ts` 与 e2e `bone_edit.spec.ts`：内置动作库每武器段数/标签顺序（巨剑 5 条、近战合计 26 条、总条目 44）与 `data-builtin-clip-count` 同步更新（新增段需同步 `attack_clip_data.ts`）；
   - 无需改动：状态机、存档、AI、HUD、展示模式脚本（`orderedSegments` 自动带上新段；链间停顿位置由「第一个重击段之前」派生）。

### 8.3 完整流程 B：给长枪加蓄力突刺变体（长按轻击键触发）

**目标**：轻击键长按 ≥ 0.5s 松开触发「蓄力突刺」（高伤害、带冷却、单发无连段），点按仍是轻 1 段，冷却期内长按回落轻 1 段；AI 不蓄力因此行为不变。

1. **写变体段**（`weapon/melee_special_moves.ts`）
   ```ts
   export const SPEAR_CHARGE_HOLD = 0.5
   export const SPEAR_CHARGE_THRUST: AttackSegment = {
       id: 'spear_charge_thrust', key: 'light', step: 1, label: '蓄力突刺',
       duration: 0.45, recovery: 0.3,
       phases: [/* strike（moveSpeedMultiplier 0.2）+ recovery（仅时序） */],
       damageMultiplier: 1.8, cooldown: 0.8, next: [],
   }
   ```
   要点：`label` 让清单/HUD/展示显示中文名而非「轻击一段」；`next: []` = 单发；`cooldown` 只挡起手、冷却中自动回退兜底候选。
2. **接进该武器**（`melee_weapon.ts`）
   ```ts
   spear: meleePreset({...预设字段...}, {
       extraSegments: [SPEAR_CHARGE_THRUST],
       entries: {light: [
           {segmentId: SPEAR_CHARGE_THRUST.id, guard: holdAtLeast(SPEAR_CHARGE_HOLD)},
           {segmentId: 'spear_light_1'},   // 兜底：无守卫、放最后
       ]},
   }),
   ```
   **不要**把变体段写进 `chains.light.steps`——它不是主干段，不进「同链 1..n 顺序」；`orderedSegments` 会把它补在所属攻击键末尾（清单显示为 长枪 · 轻击一段 / 轻击二段 / 蓄力突刺 / 重击一段 / 重击二段）。
3. **输入链路（已具备，无需改动）**：`modes/play/camera.ts` 在攻击键 mouseup 时算出按住时长 → `characterSystem.setPlayerAttack('light', held)` → `world.ts` 写入单帧脉冲 → `setInput(..., attackKey, attackHoldDuration)` → 起手守卫 `holdAtLeast` 求值。AI 侧固定 `holdDuration: 0`，因此永远命中兜底段。
4. **验证**（本仓库已落地的断言）
   - 单测 `weapon/attack_chain.test.ts`：长按命中变体、点按回落轻 1、冷却中回退轻 1、`orderedSegments` 顺序、变体段 `next` 为空且带冷却；
   - 单测 `state_machine/machine.test.ts`：真实状态机长按 → `activeSegment === 'spear_charge_thrust'` 且挂上段冷却；段中途按住不推进；松手后收招回 idle；冷却期内长按回退 `spear_light_1`；
   - e2e：骨骼动画内置动作库出现 `spear_charge_thrust` 条目与「长枪 · 蓄力突刺」标签（可用它直接可视化调动作）。

### 8.4 新增近战武器

1. 在 `src/character/weapon/melee_weapon.ts` 的 `MELEE_WEAPON_PRESETS` 中用 `meleePreset({...})` 添加预设，**必须填写 `name` 字段（武器中文名）**——它同时驱动角色属性面板的武器下拉、展示场景的头顶标签与骨骼动画内置动作库的分组名。
2. 填写 `holdModes: readonly HoldMode[]`（可支持的单持 / 双手共持 / 双持，**首个为默认模式**）；`offhandMesh` 仅为双持模式的副手网格。
3. 攻击链由 `meleePreset` 自动调用 `buildMeleeAttacks(base.id, attackOptions)` 注入到 `attacks[holdModes[0]]`（`attacks` 为「持握模式 → 攻击链」map）；该武器若需要特殊链长/变体，把 `attackOptions` 作为第二个参数传入（见 8.2 / 8.3）。多持握模式武器可为各模式在 map 中分别提供连段，未声明的模式由 `weaponAttacksOf` 回退默认模式。

## 9. 持握模式与段动作组合（HoldMode / SegmentPoseLayer）

1. **持握模式**：三态常量 `HoldMode = 'one_handed' | 'two_handed' | 'dual_wield'`（`character/weapon/hold_mode.ts`）。角色实体持久化 `holdMode`（`CharacterEntity.holdMode`，存档字段 `CharacterSaveConfig.holdMode?`，非法值安全回退）；武器用 `holdModes` 声明可支持模式，`attacks: HoldModeAttacks`（`Partial<Record<HoldMode, WeaponAttacks>>`）提供各模式连段。切换入口 `CharacterEntitySystem.setHoldMode(id, mode)`：武器不支持时回退默认模式并返回 `false`，切换后按新模式重解析 `attacks` 并清空段冷却 / 当前段。
2. **动画上下文**：`AnimationContext.holdMode`（替代原 `twoHanded` 布尔）；双手共持 IK 判定改为 `holdMode === 'two_handed'`，双持仍由 `model.offhandWeaponGroup !== null` 判定。
3. **段的动作组合**：`AttackSegment.poses: readonly SegmentPoseLayer[]`（`{poseId, weight, progressOffset?}`）。pose 资产以 `attack_clip_data.ts` 的基础关键帧为底，合并 `attack_pose_edits.ts` 的逐段姿势修订；播放器 `createComposedAnimationPlayer` 按主进度采样各层，再经 `composePoses` 按**关节归一化加权平均**合成。
4. `detectBox`（AI 出招检测箱）与 `mesh`（程序化模型）必须填写，其余数值（`damage` / `knockbackForce` / `knockbackY` / `detectionRange`）按武器定位给定。
5. 该武器各攻击段的**动画关键帧**由 `attack_clip_data.ts` 的基础资产与 `attack_pose_edits.ts` 的逐段姿势修订共同提供。

### 8.5 新增远程武器

1. 在 `src/character/weapon/ranged_attacks.ts` 的 `RANGED_ATTACK_SPECS` 中添加该武器的段规格（`segmentId` / `duration` / `cooldown` / `phases`）。**阶段必须有**（阶段名取自 `ATTACK_PHASES`，远程常用 `draw` / `aim` / `release` / `windup`），动作比例之和应为 1；`aim` 类阶段建议 `cancellable: true` 以便瞄准期被 dash 打断。
2. 在 `src/character/weapon/ranged_weapon.ts` 的 `RANGED_WEAPON_PRESETS` 中用 `rangedPreset({...})` 添加预设（`name` 中文名必填，弹道数值、`detectionRange` / `idealRange` / `retreatRange` 按定位给定）；攻击链由 `buildRangedAttacks(base.id)` 自动注入。
3. 远程目前是**单段**（`next: []`、`heavy` 空链）：需要多段（三连射、蓄力-释放）时在 `RANGED_ATTACK_SPECS` 里加段并在 `buildRangedAttacks` 中填写 `next`/`steps`（与近战同构：`entries` 决定起手、`steps` 决定清单与顺序、`next` 决定推进）。

### 8.6 用 `next` 与起手守卫表达条件（速查）

- **条件起手**：变体段放进该键 `entries` 靠前位置并挂守卫（如 `holdAtLeast(0.5)`），无守卫兜底段放其后；两者冷却独立，变体冷却中自动回退兜底。
- **条件续段**：写进当前段 `next`，守卫候选在前、兜底候选在后（如 `[{to: 'x_thrust', guard: hasMoveInput}, {to: 'x_light_2'}]`）。
- **链终止**：`next: []`；**跨链切换**由输入侧异键自动走起手解析，不需要写 `next`。
- **守卫原语**：`always` / `pressedKey(key)` / `pressedOtherKey(key)` / `holdAtLeast(s)` / `holdLessThan(s)` / `hasMoveInput` / `noMoveInput` / `cooldownReady(id)` / `allOf` / `anyOf` / `not`。
- 测试夹具可参考 `src/character/combat/test_weapon.ts`：6 段覆盖蓄力起手、点按兜底、键组分离、方向变体、循环链、无链单发与非 0 冷却；它通过 `registerWeaponPreset` 注册为额外预设（不进面板下拉），`world.ts` 对 `TEST_WEAPON_ID` 特判装配。

### 8.7 阶段专用逻辑与默认行为

（可选）需要阶段专用逻辑时：创建 `StateHandler` 并在装配处调用 `registerPhaseHandler('attacking_{segmentId}_{phaseName}', handler)`（由 `states/attacking/index.ts` 导出）。**当前生产武器未注册任何阶段 handler，全部走默认行为**：

- 有移动输入时按阶段 `moveSpeedMultiplier` 缩放 `entity.config.speed` 驱动移动（攻击中推进/突进，同 walking 的斜坡投影/吸附逻辑）；
- 无移动输入时衰减残留速度 + 斜坡防滑。注意不能只衰减存量速度：无限连段下 AI 长期驻留 attacking，速度会衰减到 0 且永不补充，导致攻击一段时间后站桩不动。
- 动画无需专用文件：攻击动画是段 id 对应的显式骨骼关键帧（`attack_clip_data.ts`），在骨骼动画编辑器编辑后导出即可，无程序化参数。

### 8.8 新增 flinching 触发源

在伤害回调或环境效果中设置 `combat.pendingFlinch = true`，下一帧 attacking 的 transition guard 会检测到并转入 flinching。

### 8.9 改动影响清单（增删段后需要同步的断言）

| 位置 | 为什么 |
|---|---|
| `weapon/attack_chain.test.ts` | 每武器段数/链编排/顺序/时长倍率/倾斜角断言（表驱动，新增武器或改链长时同步 `MELEE_CHAIN_STEPS`） |
| `weapon/melee_weapon.test.ts` | 武器预设数量（6 把近战）与字段完整性 |
| `combat/attack_phases.test.ts` | 遍历各武器实际段检查阶段比例/类型合法性（不写死段数，一般无需改） |
| `state_machine/machine.test.ts` | 连段推进与起手解析的端到端断言（改链长/加变体时补对应用例） |
| `modes/bone_edit/builtin_clips.test.ts` + `e2e/bone_edit.spec.ts` | 内置动作库条目总数（当前 9 + 26 + 9 = 44）、每武器标签顺序、`data-builtin-clip-count` |
| `entity/character/appearance/clips/attack_clips.ts` | 攻击 clip 解析 `getAttackClipById`（合并基础关键帧与逐段姿势修订；惰性缓存） |
| `docs/showcase.md` / `docs/bone_animation_system.md` | 展示清单与内置动作库的段数/顺序描述 |

---

## 九、核心文件索引

### 9.1 武器模组（`src/character/weapon/`）

| 文件 | 内容 |
|------|------|
| `attack_chain.ts` | 攻击链领域模型：`ATTACK_KEYS` / `AttackKey`、`AttackSegment`、`AttackTransition`、`AttackEntry`、`WeaponAttackChain`、`WeaponAttacks`；守卫原语（`always`/`pressedKey`/`pressedOtherKey`/`holdAtLeast`/`holdLessThan`/`hasMoveInput`/`noMoveInput`/`cooldownReady`/`allOf`/`anyOf`/`not`）；解析与查询（`findSegment`/`chainOf`/`resolveEntrySegment`/`resolveNextSegment`/`orderedSegments`/`segmentDisplayName`/`segmentTotalDuration`） |
| `melee_attacks.ts` | 近战段模板与链编排：`MELEE_SEGMENT_KEYS`（light_1/2/3、heavy_1/2）、`SEGMENT_META`（键组/序号/是否重段）、段时长常量（轻 0.267+0.266 / 重 0.4+0.267，0.75 倍速）、重段倍率 1.6、`MELEE_CHAIN_SPECS`（缺省链编排）、`meleeSegmentId`、`buildMeleeAttacks(weaponId, options)` |
| `attack_clip_data.ts` / `attack_pose_edits.ts` | 攻击动画基础稀疏关键帧与逐段局部姿势修订（`getAttackClipById` 合并解析） |
| `melee_special_moves.ts` | 近战条件变体段（非模板主干段）：长枪「蓄力突刺」`SPEAR_CHARGE_HOLD` / `SPEAR_CHARGE_THRUST` |
| `ranged_attacks.ts` | 远程段规格（9 把武器，单段）：`RANGED_ATTACK_SPECS`、`rangedSegmentIdOf`、`buildRangedAttacks` |
| `catalog.ts` | 武器目录统一查询：`WeaponConfig` / `WeaponType`、`DEFAULT_WEAPON_ID`、`ALL_WEAPON_PRESETS`、`findWeaponPreset`、`weaponPresetOrDefault`、额外预设注册 `registerWeaponPreset`（测试武器） |
| `weapon_runtime.ts` | `createWeaponRuntime(weaponId, overrides)` → `{weapon, attacks}`：伤害覆写、起手段冷却覆写（`isEntrySegment` 判定）、远程弹道覆写；动作/时长/阶段不可覆写；`isKnownWeaponId` |
| `melee_weapon.ts` | `MeleeWeaponConfig`（含 `detectBox` 与 `attacks`）与 6 个近战预设（`meleePreset` 自动注入攻击链） |
| `ranged_weapon.ts` | `RangedWeaponConfig`（含 `passThroughCategories` 与 `attacks`）与 9 个远程预设；`DEFAULT_BULLET_PASS_THROUGH_CATEGORIES = ['area']` |

### 9.2 战斗运行时（`src/character/combat/`）

| 文件 | 内容 |
|------|------|
| `types.ts` | `CombatComponent`（`weapon` / `attacks` / `segmentCooldowns` / `activeSegment` / `bufferedSegment` / `attackTimer` / `phaseIndex` / `phaseTimer` / `attackedTargets` / `dashSkill` …）；`createCombatComponent`、`setCombatWeapon`（换装整体替换武器运行时） |
| `attack_runtime.ts` | 段冷却读写与上下文构造：`segmentCooldownRemaining` / `armSegmentCooldown` / `tickSegmentCooldowns` / `attackContextOf` / `canStartAttack` |
| `attack_phases.ts` | `ATTACK_PHASES` / `AttackPhaseName`、`AttackPhase`（仅时序/移速/可中断）、`resolvePhases`（未定义时回退单阶段）、`phaseDurationOf`、`FLINCH_DURATION` / `FLINCH_IMMUNITY_DURATION` |
| `dash_skill.ts` | 冲刺（角色能力，非武器段）：`DashSkillConfig` / `DashSkillRuntime`、`createDashSkillRuntime` |
| `test_weapon.ts` | 测试武器：6 段守卫链夹具（蓄力 / 点按兜底 / 键组分离 / 方向变体 / 循环链 / 无链单发 / 非 0 冷却），仅供单元测试 |
| `executor.ts` / `damage.ts` / `explosion.ts` | 执行器接口与伤害结算（命中窗口由动画事件轨驱动） |

### 9.3 状态机与角色侧

| 文件 | 内容 |
|------|------|
| `src/character/state_machine/types.ts` | `CHARACTER_STATES`（含 `'flinching'`）；`CharacterInput.attackKey: AttackKey \| undefined`、`attackHoldDuration`（`setInput` 第 6/7 参）；`MachineContext.attackPhase` |
| `src/character/state_machine/machine.ts` | 静态 `Record<CharacterState, StateHandler>` 注册 8 状态；transition guard 检查 + `onStateChange` 派发；**进入 attacking 时用 `resolveEntrySegment` 完成起手解析并写入 `combat.activeSegment`** |
| `src/character/state_machine/states/attacking/index.ts` | attacking 段子状态调度器：推进阶段时间线 → 按输入求段转换写缓冲 → 段播完推进下一段（不退出状态）→ 委托阶段 handler 或走默认行为；导出 `phaseHandlerRegistry` / `registerPhaseHandler` |
| `src/character/state_machine/states/attacking/segment.ts` | 段子状态单元：`enterAttackSegment`（重置计时/挂段冷却/清命中记录/唤醒刚体）、`advanceSegmentPhases`、`isSegmentPhasesDone`、`resolveSegmentNextState`（同键 → 本段 `next`；异键 → 该键起手解析） |
| `src/character/state_machine/states/{idle,walking}.ts` | 攻击转换 guard 复用 `canStartAttack`（无起手候选则不进入 attacking） |
| `src/character/state_machine/states/flinching.ts` | 受击硬直状态 handler（enter 清 `bufferedSegment` 与阶段计时，exit 挂免疫窗口） |
| `src/character/archetypes.ts` | 存档 / 面板的攻击配置：`AttackConfig = {weaponId, damage?, cooldown?, ranged?}`（只有武器与数值覆写）、`ATTACK_PRESETS` |
| `src/save_load/types.ts` | `SAVE_FORMAT_VERSION = 3`；`CharacterSaveConfig.attack: AttackConfig`（原 `attackSlot` 已删除） |

### 9.4 实体表现与调试

| 文件 | 内容 |
|------|------|
| `src/entity/character/appearance/types.ts` | `CharacterModel`（`weaponGroup` / `weaponHitBox` / `weaponGripY`）；`AnimationContext`（`stateTime` / `horizontalSpeed` / `twoHanded` / `attackSegment` / `attackPhase` / `attackPhaseProgress` / `attackTotalProgress` / `attackPhaseIndex` / `weaponHeld`） |
| `src/entity/character/appearance/system.ts` | clip 调度器：动画键（attacking 用 `attacking:{segment.id}`）→ 取 clip + 快照加权混合；双手武器左腕 IK（`ctx.twoHanded`） |
| `src/entity/character/appearance/clips/attack_clips.ts` | 攻击 clip 解析：`getAttackClipById(段 id)`（`attack_clip_data.ts` → `clipFromJSON`，惰性缓存） |
| `src/entity/character/appearance/clips/base_clips.ts` | 基础状态 clip 生成器（`getBaseClip` / `fallingSpeedTier` / `CHARACTER_JOINT_IDS`） |
| `src/entity/character/appearance/weapon_mesh.ts` | 武器本地命中箱 `WeaponLocalHitBox`（近战武器显式打击部位盒） |
| `src/entity/character/combat/melee_executor.ts` | 伤害判定：武器命中箱 OBB × 受击箱 OBB（`testMeleeHit`）；伤害 = `weapon.damage × activeSegment.damageMultiplier`；攻击检测箱 `attackDetectOBB` / `testAttackDetect` |
| `src/entity/character/combat/obb.ts` | OBB 类型 + `yawOBB` / `obbFromTransform` / 15 轴 SAT `obbIntersect` |
| `src/entity/character/combat/ranged_executor.ts` | 子弹生命周期与可穿过类别判定（`castShape` 位移扫描 + 角色宽容半径判定） |
| `src/entity/character/combat_vfx/hitbox_debug.ts` | 判定箱（红）/ 受击箱（青）/ 检测箱（橙）/ 射程圆环（橙，远程）/ 视线扇形（蓝）debug 可视化 |
| `src/entity/character/physics/world.ts` | `weaponRuntimeOf(attack)`（test_weapon 特判）；`setPlayerAttack(attackKey, holdDuration)` 起手解析与攻击中写脉冲；每帧段冷却递减（`tickSegmentCooldowns`）与 `AnimationContext` 装配；换装 `setCombatWeapon` + 清空段冷却/当前段 |
| `src/modes/play/camera.ts` | 攻击键按住计时（mousedown 记录时刻，mouseup 携带按住秒数触发，右键重击同为松开触发） |
| `src/modes/play/index.ts` | HUD 技能计时：SKILLS 首行冲刺 + 按 `orderedSegments` 每段一行（动作 / 恢复 / 冷却） |
| `src/modes/bone_edit/builtin_clips.ts` | 骨骼动画内置动作库：按 `orderedSegments` 枚举全部武器段（`segmentDisplayName` 作显示名） |
| `src/entity/character/ui/panel.ts` | 属性面板攻击区：武器下拉（`ALL_WEAPON_PRESETS`）+ 伤害 / 起手段冷却 / 远程弹道覆写 |
| `src/physics/collision_category.ts` | 碰撞类别（`ground` / `box` / `fragment` / `area` / `terrain` / `character`）与 membership 位打包 / 解析 / 掩码工具 |

**已随本次重构删除**：`combat/skill_types.ts`、`combat/melee_skill.ts`、`combat/ranged_skill.ts`、`combat/combo_guard.ts`、`state_machine/states/attacking.ts`（旧单文件 meta-state）、`appearance/animators/`（旧动画器目录）、`attack_phases.ts` 的 `RANGED_PHASE_PRESETS` 与 `AttackSubState`、**攻击动画抽象参数**（`AttackAnimConfig` / `ArmAnimConfig` / `EASING_TYPES` / `ATTACK_TYPES` / `DEFAULT_ANIM` / `applyEasing` / `strikeCurve` / `segment.swingTilt` / `combat.swingTilt` / `AttackSegment.twoHanded`）与参数化 clip 生成器（由 `attack_clip_data.ts` 显式关键帧替代）。

---

## 十、CombatComponent 字段清单

| 字段 | 类型 | 说明 |
|------|------|------|
| `weapon` | `WeaponConfig` | 装备武器（含伤害 / 起手段冷却 / 远程弹道数值覆写） |
| `attacks` | `WeaponAttacks` | 当前武器攻击链（换武器时由 `setCombatWeapon` 整体替换） |
| `segmentCooldowns` | `Map<string, number>`（readonly） | 段冷却剩余（秒），段 id → 剩余时间；仅非 0 冷却的段写入；`tickSegmentCooldowns` 逐帧递减（≤ 0 时删除条目） |
| `activeSegment` | `AttackSegment \| undefined` | 当前攻击段（attacking 期间有效，进入状态时由起手解析写入） |
| `bufferedSegment` | `AttackSegment \| undefined` | 缓冲的下一段（段播完由段转换 / 异键起手解析消费） |
| `attackActive` | `boolean` | 是否处于攻击中（受击硬直回调据此判定） |
| `attackTimer` | `number` | 当前段累计时间（动作 + 恢复全程，秒） |
| `phaseIndex` | `number` | 当前阶段索引（0-based，越界表示阶段已完成） |
| `phaseTimer` | `number` | 当前阶段已用时间（秒） |
| `attackedTargets` | `Set<number>` | 本次段已命中的目标（每段切换时清空，同一段内只结算一次） |
| `dashSkill` | `DashSkillRuntime` | 冲刺技能运行时（角色能力，独立于攻击段） |
| `pendingFlinch` | `boolean` | 是否被标记为需要受击硬直 |
| `flinchImmunityTimer` | `number` | 受击保护剩余时间（秒）：flinching 退出后免再触发硬直，防无限连段锁死；伤害不受影响 |

**已删除字段**：`currentSkillIndex`、`chainEntryIndex`、`bufferedSkillIndex`、`skills`（技能槽列表）、`SkillSlot` / `SkillTimingConfig` 相关类型。

---

## 十一、测试覆盖清单

> 测试框架：Vitest。测试文件命名为 `<被测模块>.test.ts`，与被测源文件同目录。测试使用 `DT = 1/60` 固定帧步长、内联 mock 工厂函数、帧进辅助函数和 `it.each()` 参数化测试。物理行为测试由 `entity/character/physics/harness.ts` 提供真实 rapier 世界的逐帧推进夹具。

### 11.1 攻击链与武器运行时 — `character/weapon/attack_chain.test.ts`

| 覆盖点 | 验证方式 |
|--------|----------|
| 近战链结构 | 每把近战武器 4 个主干段；`chains.light.steps` = [轻1, 轻2]、`chains.heavy.steps` = [重1, 重2]；轻/重起手候选分别为轻1 / 重1 且无守卫 |
| 段转换 | `resolveNextSegment` 轻1↔轻2、重1↔重2 循环；链终止段（蓄力段、远程单段）返回 `undefined` |
| 段数值 | 轻段总时长 0.533s（0.267+0.266）、重段 0.667s（0.4+0.267）；重段 `damageMultiplier` = 1.6；普通攻击段冷却全为 0 |
| 段倾斜角确定性 | 轻1 / 轻2 = 0、重1 > 0.4π、重2 < 0 |
| 远程链 | 每把远程武器单段、`key = 'light'`、`next = []`、无重击链（`entries` / `steps` 为空）；段 id 沿用原远程技能 id |
| 段清单顺序 | `orderedSegments` 近战为 轻1 → 轻2 → 重1 → 重2；条件变体段接在所属键末尾（test_weapon 全序断言）；全部生产武器轻链位于重链之前 |
| 起手解析 | 无条件候选直取；冷却未就绪 → `undefined`；`currentSegmentId` 排除自身；守卫变体优先于兜底；变体冷却中回退兜底 |
| 段转换守卫 | 方向组合键变体优先于兜底（`hasMoveInput`）；链终止段无下一状态 |
| 展示名 | 缺省「轻击一段 / 重击二段…」；条件变体段用 `label` |
| 武器运行时 | 伤害覆写生效且不污染预设；起手段冷却覆写只作用于起手段（链中段保持预设）；远程弹道覆写生效；未知武器 id 回退默认武器；测试武器经额外注册表可解析出 6 段 |

### 11.2 武器预设 — `character/weapon/melee_weapon.test.ts` / `ranged_weapon.test.ts`

| 覆盖点 | 验证方式 |
|--------|----------|
| 预设完整性 | 近战 6 种 / 远程 9 种；id 与 key 匹配；`type` 正确；每个键名唯一 |
| 武器中文名 | `name` 非空、纯中文、与 `id` 不同、同类内互不重复 |
| 近战数值约束 | 伤害 / 击退 / `knockbackY` 为正；`war_hammer` 伤害最高；`detectBox` 尺寸分量为正且前缘在身体前方；`spear` 检测箱前缘最远 |
| 远程数值约束 | 弹道参数为正；`crossbow` 弹速最快；`shotgun` 有 `spreadCount` / `spreadAngle`；`staff` 有 `explosionRadius`；`magic_wand` 有 `homingStrength`；`grenade` 有 `throwAngle` 与 `explosionRadius`；远程侦测范围大于近战 |
| 子弹可穿过类别 | `DEFAULT_BULLET_PASS_THROUGH_CATEGORIES` 默认为 `['area']` |

### 11.3 段阶段模型（attack_phases）

原 `attack_phases.test.ts` 随抽象动画参数一并删除。剩余覆盖：`resolvePhases(undefined)` / 空数组返回单阶段回退（strike、ratio 1、移速 0.3）；`phaseDurationOf` 的 recovery 取段 recovery、其它按 `durationRatio` 分摊。段动作形态由 `attack_clip_data.ts` 关键帧决定，不再有参数校验。

### 11.4 状态机与连段 — `character/state_machine/machine.test.ts`

describe 区块：连段守卫（test_weapon 蓄力/方向组合键）、平地移动、斜坡 falling 判定、falling 行为、攻击/冲刺在陡坡结束、斜坡防滑、跳跃、输入缓冲连段（轻/重双链）、受击硬直与保护窗口。

| 覆盖点 | 验证方式 |
|--------|----------|
| 起手解析 | 点按（hold = 0）→ 兜底段、长按 ≥ 阈值 → 蓄力段、重击键 → 重链起手段；起手段全冷却时不进入 attacking（保持 idle） |
| 段推进 | 进入 attacking 时 `activeSegment` 已由起手解析写入、`phaseIndex` / `phaseTimer` 归零；`phaseTimer >= phaseDuration` 推进阶段；段总时长满足后 transition 退出 |
| 输入缓冲连段 | 段中不推进（即使缓冲存在，`phaseIndex` 已进 recovery 仍停留本段）；段末才消费缓冲；轻链无限循环 轻1→轻2→轻1；缓冲缺失则本段播完收招；普通攻击全程 `segmentCooldowns` 为空 |
| 冷却夹具 | 蓄力段触发即挂冷却（`segmentCooldowns.get('test_weapon_charge') === charge.cooldown`），点按兜底段冷却独立仍可起手 |
| 跨键切链 | 段中改按重击键 → 段末切到重链起手段且不退出 attacking |
| flinching | 攻击中被击中（`pendingFlinch`）立即中断攻击进入 flinching；硬直播完按支撑/输入转换；退出挂 `FLINCH_IMMUNITY_DURATION` 保护窗口；dying 优先级高于 flinching |

### 11.5 伤害判定几何 — `entity/character/combat/obb.test.ts` / `melee_executor.test.ts`

OBB 构造与 15 轴 SAT 相交；`targetHitBoxHalves` 随 scale 缩放；武器命中箱判定（`testMeleeHit`：重叠命中 / 远离不命中 / 高度分离不命中 / 武器姿态旋转与目标朝向旋转）；命中箱 `reach` 几何属性（长杆 > 短刃）；攻击检测箱（`attackDetectOBB` / `testAttackDetect`：几何参数、scale 缩放、身前命中、身后余量、侧面覆盖、武器差异、朝向旋转）；命中窗口（`setHitWindow` 事件轨驱动：窗口关闭时 update 早退、非近战武器早退）。

### 11.6 攻击动画数据 — `character/weapon/attack_clip_data.ts` / `entity/character/appearance/clips/attack_clips.ts`

攻击动画由基础稀疏关键帧和逐段姿势修订组成，`getAttackClipById` 校验修订关节/时间后惰性解析缓存；缺失段 id 抛错。`attack_clips.test.ts` 覆盖全部姿势修订的段 id、时间、关节和肘方向；`system.test.ts` 覆盖双手武器副握点与肘极向；`builtin_clips.test.ts` + e2e 覆盖内置动作库条目与事件轨。

### 11.7 投掷物穿透与碰撞类别 — `entity/character/combat/ranged_executor.test.ts` / `physics/collision_category.test.ts`

真实 rapier 世界夹具（`harness.ts`）端到端覆盖：默认（仅 area）命中箱子即消失且箱后目标无伤害、可穿过列表加入 `box` 后穿过箱子命中目标、`area` 类别不阻挡、世界地面落地即消失、地形/碎片阻挡、非敌对角色挡下子弹不结算伤害、`character` 入列后角色完全透明、空列表命中场景几何即消失、爆炸子弹命中场景几何就地引爆。`collision_category` 覆盖类别位打包/解析往返、掩码匹配、`isBlockingGeometry` 判定与 fail-closed 行为。

### 11.8 内置动作库 — `modes/bone_edit/builtin_clips.test.ts`

覆盖全部基础状态与全部武器攻击段（9 + 24 + 9 条）；分组按展示顺序；近战按武器分组、每武器内 轻1 → 轻2 → 重1 → 重2 连续排列；id / 显示名 / clip 名全库唯一；轨迹时间升序且末帧落在时长处；攻击条目带 `hitbox_on` / `hitbox_off` 事件轨（`long_sword_light_1` 时间点 = 0.02 / 0.17）；首帧静止位置与预设骨架一致；惰性构建并缓存。

### 11.9 地面检测 — `character/state_machine/ground.test.ts`

`isSupportedOn` / `shouldFall` / `projectToSlope` / `applySlopeAntiGravity`。

### 11.10 物理行为 — `entity/character/physics/*.test.ts`

`harness.ts` 提供真实 rapier 世界夹具（`createHarnessWorld` / `tick` / `tickMulti`）：斜坡行走（`slope.test.ts`）、挤压弹出与推挤阻断（`squeeze_eject.test.ts`）、角色分离与斜坡补偿（`separation.test.ts`）、地面状态机（`ground_state.test.ts`）、质量配置（`mass.test.ts`）、面板信息（`panel_info.test.ts`）。

### 11.11 AI — `entity/character/ai/ai.test.ts` / `ai/nav/nav.test.ts`

双层 FSM 转移、静止检测（stall 恢复/交火豁免）、接敌冷却、追击活动半径、导航 stuck 倒退逃逸等；AI 出招门控统一用 `canStartAttack(combat, {..., holdDuration: 0, attackKey: 'light'})`。
