# AI 行为原点策略 + 可配置追击半径 设计

> 状态：**已实现**（存档 v11）。本文档保留为设计决策记录；实现细节以代码与模块文档（[`src/entity/character/ai/ai.md`](../../src/entity/character/ai/ai.md)、[`src/character/character.md`](../../src/character/character.md)、[`src/save_load/save_load.md`](../../src/save_load/save_load.md)）为准。
>
> 面向读者：AI / 角色领域 / 战斗伤害链路 / 存档 / UI 面板 / i18n / 展示模式 相关实现者。

## 1. 目标

- 现状：AI 的「行为判断原点」等价于**出生点**，写死为 `AIContext.spawnPoint`，只被三处消费——巡逻范围（`peace/states/patrol.ts`）、逃跑兜底方向（`combat/states/flee.ts`）、追击活动半径（`ai/machine.ts`）。角色一旦离开出生点，行为仍以出生点为家。
- 新增一组**独立于和平 / 战斗策略**的维度 **`OriginSubStrategy`（行为原点更新策略）**，控制原点如何在角色行动过程中迁移：
    - 居民：恒以初始原点为准（等价现状）。
    - 战斗者：以**最近一次击杀时击杀者自身的位置**为原点。
    - 狩猎者：以**最近一次被击杀敌人的位置**为原点。
    - 漫游者：以**一个可配置时间间隔后所在的位置**为原点（默认 20s），战斗期冻结、脱战后结算。
- 将追击活动半径 `CHASE_LEASH_RADIUS` 从**全局常量**改为**角色属性 `chaseLeashRadius`**，并在编辑面板逐角色配置 + 存档持久化。
- 同步改进击杀钩子：`onDeath` 回调携带 `sourceId`，取代此前计划的「在 `onDamageTaken` 里做一次性判死」方案。

## 2. 术语

| 术语 | 含义 |
|---|---|
| 行为原点（origin） | AI 决策参考的锚点。巡逻范围、逃跑兜底方向、追击半径判定均以它为中心 |
| 初始原点（spawnPoint） | 角色创建（`activateAI`）时的脚底位置，**不可变**；用于「居民」策略与策略切换时复位 |
| 追击半径（chaseLeashRadius） | `chase` 状态每帧检查「角色距原点的水平距离」的阈值，超出即放弃追击（`ai/machine.ts`） |
| 脱战 | `activeFsm` 由 `combat` 切回 `peace`（正常目标超距 / 目标死亡 / 卡死放弃 / 活动半径超限） |

## 3. 决策记录

| 议题 | 结论 |
|---|---|
| 维度归属 | 原点策略是**独立维度**，与 `peaceStrategy` / `combatStrategy` 并列，不改变这两者的语义 |
| 战斗者取样点 | 击杀瞬间**击杀者自身**的脚底位置 |
| 狩猎者 | 新增第 4 个策略值，取**被击杀者**的位置；命名 `hunter` / 狩猎者（备选：掠食者 / 征服者 / 拾荒者） |
| 漫游者更新时机 | 计时器在和平与战斗期间**都持续倒数**，但**原点写入只在脱战后**发生；战斗期原点冻结 |
| 追击半径安全阀 | **取消** `combatLeashAnchor` 方案。漫游者战斗期原点不动，`chase` leash 直接读实时 `origin` 对四类策略均安全（见 §6.5） |
| 击杀钩子载体 | 改为 `onDeath(sourceId?: number)`；在伤害结算里仅在「存活 → 死亡」跳变时触发一次 |
| 追击半径归属 | 由全局常量改为**角色属性**，支持面板配置与存档 |
| 集成范围 | 完整接入：面板 + 存档 + i18n + 展示模式 |

## 4. 原点策略

`ORIGIN_SUB_STRATEGIES = ['resident', 'fighter', 'hunter', 'roamer'] as const`

| 预设 | id | 中文 | 原点更新规则 | 更新触发时机 | 战斗期是否更新 |
|---|---|---|---|---|---|
| 居民 | `resident` | 居民 | 恒为 `spawnPoint`（不更新） | — | 否 |
| 战斗者 | `fighter` | 战斗者 | 击杀瞬间取**击杀者自身**脚底位置 | 每次成功击杀 | 是（击杀为瞬时事件） |
| 狩猎者 | `hunter` | 狩猎者 | 击杀瞬间取**被击杀者**脚底位置 | 每次成功击杀 | 是（击杀为瞬时事件） |
| 漫游者 | `roamer` | 漫游者 | 取**当前所在位置** | 脱战后的首个和平帧（计时已到期时） | 否（冻结，见 §6.4） |

`resident` 为默认值，行为与现状**完全一致**。

## 5. 数据模型

### 5.1 策略类型（`src/character/ai_strategy/types.ts`）

```ts
export const ORIGIN_SUB_STRATEGIES = ['resident', 'fighter', 'hunter', 'roamer'] as const
export type OriginSubStrategy = typeof ORIGIN_SUB_STRATEGIES[number]

/** 原点策略配置 */
export interface OriginConfig {
    /** 漫游者原点更新间隔（秒）；其他策略为 0 不适用 */
    interval: number
}

export const isOriginSubStrategy = (v: string): v is OriginSubStrategy =>
    (ORIGIN_SUB_STRATEGIES as readonly string[]).includes(v)
```

### 5.2 默认配置（新文件 `src/character/ai_strategy/origin.ts`）

结构对齐现有 `peace.ts` / `combat.ts`：

```ts
export const DEFAULT_ORIGIN_CONFIGS: Record<OriginSubStrategy, OriginConfig> = {
    resident: {interval: 0},
    fighter:  {interval: 0},
    hunter:   {interval: 0},
    roamer:   {interval: DEFAULT_ROAMER_INTERVAL}, // 20
}
```

### 5.3 角色实体（`src/character/types.ts`）

`CharacterState.ai` 新增**必填**字段（与 `peaceStrategy` / `combatStrategy` 同级）：

```ts
/** 行为原点更新策略（仅非玩家角色有效，默认 resident） */
originStrategy: OriginSubStrategy
/** 漫游者原点更新间隔（秒，仅 originStrategy === 'roamer' 时有意义，默认 20） */
originInterval: number
/** 追击活动半径（m，角色属性，距行为原点超出即放弃追击；默认 CHASE_LEASH_RADIUS = 20） */
chaseLeashRadius: number
```

> 说明：`originInterval` 直接落在 `state.ai`（而非每次查表 `DEFAULT_ORIGIN_CONFIGS`），以便面板改值后即时生效并持久化。

### 5.4 AI 上下文（`src/entity/character/ai/types.ts`）

```ts
export interface AIContext {
    /** 不可变初始锚点（创建时位置）：居民策略原点与策略复位用 */
    spawnPoint: {x: number; y: number; z: number}
    /** 实时行为原点：巡逻范围 / 逃跑兜底 / 追击半径判定读它 */
    origin: {x: number; y: number; z: number}
    originStrategy: OriginSubStrategy
    originConfig: OriginConfig
    /** 漫游者距下次原点更新的剩余时间（秒）；和平与战斗期都递减 */
    originTimer: number
    // ……其余字段不变
}
```

**不新增 `combatLeashAnchor`**（决策记录）。

### 5.5 存档（`src/save_load/types.ts`）

`CharacterSaveConfig` 新增可选字段（旧档缺失安全回退）：

```ts
originStrategy?: 'resident' | 'fighter' | 'hunter' | 'roamer'
originInterval?: number
chaseLeashRadius?: number
```

## 6. 运行时

### 6.1 原点写入辅助（新文件 `src/entity/character/ai/origin.ts`）

```ts
/** 由角色物理体反算脚底原点 Y（body 中心 - 半高）写入 ctx.origin */
export const setOriginFromCharacter = (ctx: AIContext, character: CharacterEntity): void => {
    const pos = character.body.translation()
    const footY = pos.y - (CHARACTER_BASE_SIZE.height * character.state.config.scale) / 2
    ctx.origin.x = pos.x; ctx.origin.y = footY; ctx.origin.z = pos.z
}

/** 写入任意世界坐标（狩猎者用被击杀者位置） */
export const setOriginFromPosition = (ctx: AIContext, x: number, y: number, z: number): void => { /* … */ }
```

### 6.2 漫游者更新（`updateOrigin`）

每帧在 `updateAI` 顶部（`isDead` 检查之后、敌情检测之前）调用：

```ts
export const updateOrigin = (dt: number, ctx: AIContext, character: CharacterEntity): void => {
    if (ctx.originStrategy !== 'roamer') return
    ctx.originTimer -= dt                 // 和平与战斗期都倒数（计时器始终生效）
    if (ctx.originTimer > 0) return
    if (ctx.activeFsm !== 'peace') return // 战斗期冻结：只计时、不写原点，等脱战
    setOriginFromCharacter(ctx, character) // 脱战后首个和平帧以当前位置为原点
    ctx.originTimer = character.state.ai.originInterval
}
```

语义确认：**计时器在战斗中持续倒数；若战斗期间已到期，则脱战后立即以当前位置更新原点**（不是脱战后重新等满一个间隔）。`originInterval <= 0` 时按默认 20 处理（防御性，不产生每帧更新）。

### 6.3 击杀钩子（`notifyAIKill`）

```ts
export const notifyAIKill = (
    ctx: AIContext,
    character: CharacterEntity,
    victim: {x: number; y: number; z: number},
): void => {
    if (ctx.originStrategy === 'fighter') setOriginFromCharacter(ctx, character)
    else if (ctx.originStrategy === 'hunter') setOriginFromPosition(ctx, victim.x, victim.y, victim.z)
    // resident / roamer 不响应击杀
}
```

- `fighter` 取**击杀者**（`character`）脚底位置。
- `hunter` 取**被击杀者**脚底位置（由 `world.ts` 传入被击杀者脚底坐标）。

### 6.4 伤害 / 死亡链路改造

**目标**：击杀事件只触发一次，并携带来源。

1. 类型签名（`src/character/combat/types.ts`）：
    `onDeath: (() => void) | null` → `onDeath: ((sourceId?: number) => void) | null`
    （`() => void` 形状的函数仍可赋值给新签名，兼容现有测试替身。）
2. `src/character/combat/damage.ts`：只在存活→死亡跳变时触发，并传 `sourceId`：

    ```ts
    const wasAlive = target.health > 0
    target.health = Math.max(0, target.health - finalEvent.finalAmount)
    target.onDamageTaken?.(finalEvent.finalAmount, finalEvent)
    if (target.health <= 0 && wasAlive) target.onDeath?.(finalEvent.sourceId)
    ```

    这天然消灭了「尸体再次受击重复触发 `onDeath`」的问题，无需额外 `deathNotified` 标志。
3. `src/character/armor/armor.md` 第 154–176 行同步更新签名与调用示例。
4. `src/entity/character/physics/world.ts`：在 `spawnEntity` 中为每个角色挂 `entity.state.combat.onDeath`（紧邻现有 `combat.onDamageTaken` 赋值处）：

    ```ts
    entity.state.combat.onDeath = (sourceId) => {
        if (sourceId === undefined || sourceId === entity.id) return   // 非伤害来源 / 自伤
        const killer = characters.find(c => c.state.identity.id === sourceId)
        if (!killer || killer.state.combat.isDead) return
        if (!killer.state.combat.attackTendency(killer.state.combat.faction, entity.state.combat.faction)) return // 友军误伤
        const killerCtx = aiMap.get(killer.id)
        if (!killerCtx) return
        const vp = entity.body.translation()
        const victimFootY = vp.y - (CHARACTER_BASE_SIZE.height * entity.state.config.scale) / 2
        notifyAIKill(killerCtx, killer, {x: vp.x, y: victimFootY, z: vp.z})
    }
    ```

    边界：`sourceId` 为 `undefined`（非伤害来源）、自伤、击杀者缺失 / 已死、友军误伤（`attackTendency` 为 false）、非角色来源（弹丸未归属导致查不到）——全部跳过。
5. `onDamageTaken` 中既有的 `notifyAIDamaged`（仇恨）逻辑**保持不变**。

### 6.5 追击半径判定

`src/entity/character/ai/machine.ts` 的 `chase` 活动半径检查：

```ts
// 旧： const leash = Math.hypot(pos.x - ctx.spawnPoint.x, pos.z - ctx.spawnPoint.z)
//      if (leash > CHASE_LEASH_RADIUS) { … }
const leash = Math.hypot(pos.x - ctx.origin.x, pos.z - ctx.origin.z)
if (leash > character.chaseLeashRadius) { /* 放弃追击 → peace + 接敌冷却 */ }
```

对四类策略均安全的原因：

- `resident`：`origin === spawnPoint`，与现状一致。
- `fighter` / `hunter`：原点只在**击杀瞬间**（近身交战）迁移，且「追同速目标永远追不上」的场景**不产生击杀**、原点不动，leash 照常在阈值处兜底。
- `roamer`：战斗期原点冻结（§6.2），leash 边界不会随追击漂移。

### 6.6 原点消费者替换

以下三处由 `ctx.spawnPoint` 改读 `ctx.origin`：

- `src/entity/character/ai/peace/machine.ts`（`initPeaceContext` 的 `waypoint` 初始化）
- `src/entity/character/ai/peace/states/patrol.ts`（`rerollWaypoint` 的巡逻范围中心）
- `src/entity/character/ai/combat/states/flee.ts`（逃跑兜底方向）

## 7. 集成

### 7.1 `world.ts`

- `spawnEntity` 增参 `originStrategy` / `originInterval` / `chaseLeashRadius`，写入 `state.ai`。
- `createAIMachine(...)` 增参 `originStrategy`，初始化 `origin = spawnPoint`、`originTimer = originInterval`（仅 roamer 有意义）。
- `add`（存档加载）读 `saveConfig.originStrategy ?? 'resident'`、`saveConfig.originInterval ?? DEFAULT_ROAMER_INTERVAL`、`saveConfig.chaseLeashRadius ?? CHASE_LEASH_RADIUS`。
- `activateAI` 透传策略。
- 新增 setter 并暴露到返回接口：
    - `setOriginStrategy(id, strategy)`：更新实体字段与 `ctx.originStrategy/originConfig`；**复位原点** —— `resident` / `fighter` / `hunter` → `origin = spawnPoint`；`roamer` → `origin = 当前位置`；并重置 `originTimer`。
    - `setOriginInterval(id, seconds)`：更新 `entity.state.ai.originInterval` 与 `ctx.originConfig.interval`，重置 `originTimer`。
    - `setChaseLeashRadius(id, radius)`：更新 `entity.state.ai.chaseLeashRadius`。

### 7.2 面板（`src/entity/character/ui/panel.ts`）

在 AI 区（`peaceRow` / `combatRow` / `navRow` 附近）新增，仅非玩家角色显示：

- **原点策略下拉**：选项来自 `ORIGIN_SUB_STRATEGIES`，i18n 标签。
- **漫游者间隔输入**（数字，秒）：仅 `originStrategy === 'roamer'` 时显示（显隐逻辑对齐现有 `applyBuildVisibility`）。
- **追击半径输入**（数字，米）。

回显（`refreshFullConfig`）与应用（`onApply`）逻辑对齐 `peaceSelect` / `combatSelect`；新增 `ctx.setOriginStrategy?` / `setOriginInterval?` / `setChaseLeashRadius?` 调用。玩家勾选时整组隐藏。

### 7.3 存档（`src/save_load/`）

- `types.ts`：新增 §5.5 三个可选字段。
- `validation.ts`：`originStrategy: z.enum([...]).optional()`、`originInterval: z.number().positive().optional()`、`chaseLeashRadius: z.number().positive().optional()`；缺省由 `world.add` 回退默认。非法值不抛错。
- `serialize.ts`：写出三字段。
- `save_load.md`：更新存档结构说明与兼容性说明。

### 7.4 i18n（`src/i18n/locales/character.ts`，中 / 英）

新增键（`MainLocale` + 全部语言包）：

| 键 | 中文 | 英文 |
|---|---|---|
| `character.origin_label` | 原点策略 | Origin |
| `character.origin.resident` | 居民 | Resident |
| `character.origin.fighter` | 战斗者 | Fighter |
| `character.origin.hunter` | 狩猎者 | Hunter |
| `character.origin.roamer` | 漫游者 | Roamer |
| `character.origin.interval` | 更新间隔(秒) | Interval (s) |
| `character.chase_radius_label` | 追击半径 | Chase radius |

### 7.5 展示模式（`src/modes/showcase/modules/ai_terrain.ts`）

`makeConfig` 补 `originStrategy` / `originInterval` / `chaseLeashRadius`，可按阵营 / 单位演示四种原点策略（例如让不同 AI 单位使用不同原点策略以观察领地迁移）。

## 8. 兼容性与边界

- 旧存档缺失三个新字段 → 安全回退 `resident` / 20 / 20，不抛错（AGENTS 存档兼容红线）。
- 新字段非法值 → 校验层安全丢弃回退默认。
- `originStrategy` 为 `resident` 时行为与改动前**逐帧等价**（原点恒为初始位置）。
- `onDeath` 签名放宽为可选参数，现有 `() => void` / `null` 赋值与测试替身不受影响。
- 原点 Y 仅用于语义完整性（`patrol` 的 `waypoint.y` 不参与实际水平位移）；由脚底反算保证与初始原点同源。

## 9. 涉及文件清单

**新增**

- `docs/design/ai_origin_strategy.md`（本文档）
- `src/character/ai_strategy/origin.ts`
- `src/entity/character/ai/origin.ts`
- 测试：`src/entity/character/ai/origin.test.ts`（或并入 `ai.test.ts`）

**修改**

- `src/character/ai_strategy/types.ts`
- `src/character/types.ts`
- `src/entity/character/ai/types.ts`
- `src/entity/character/ai/machine.ts`
- `src/entity/character/ai/peace/machine.ts`
- `src/entity/character/ai/peace/states/patrol.ts`
- `src/entity/character/ai/combat/states/flee.ts`
- `src/entity/character/ai/constants.ts`（`CHASE_LEASH_RADIUS` 语义改为默认值，可更名 `DEFAULT_CHASE_LEASH_RADIUS`）
- `src/character/combat/damage.ts`
- `src/character/combat/types.ts`
- `src/character/armor/armor.md`
- `src/entity/character/physics/world.ts`
- `src/entity/character/ui/panel.ts`
- `src/save_load/types.ts` / `validation.ts` / `serialize.ts` / `save_load.md`
- `src/i18n/locales/character.ts`
- `src/modes/showcase/modules/ai_terrain.ts`
- 文档：`src/entity/character/ai/ai.md`、`src/character/character.md`

**测试夹具补全**（`CharacterEntity` 新增必填字段）：

- `src/entity/character/physics/harness.ts`
- `src/entity/character/ai/ai.test.ts` / `nav/nav.test.ts`
- `src/character/combat/explosion.test.ts`
- `src/character/state_machine/ground.test.ts` / `machine.test.ts` / `states/dying.test.ts`
- `src/entity/character/combat/melee_executor.test.ts`

## 10. 测试计划

- **原点策略**
    - `resident`：多次 `updateAI` 后 `origin` 不变。
    - `roamer`：`originTimer` 到点且处于和平 → 原点更新为当前位置、计时重置；处于战斗 → 原点不变、计时停在 ≤0；脱战后首个和平帧立即更新。
    - `fighter`：击杀后原点 = 击杀者位置。
    - `hunter`：击杀后原点 = 被击杀者位置。
    - 策略切换复位规则（resident/fighter/hunter → spawnPoint；roamer → 当前位置）。
- **追击半径**
    - `chaseLeashRadius` 决定放弃追击的阈值；超出后回 peace 并置 `COMBAT_REENTRY_COOLDOWN`。
- **伤害链路**
    - 已死目标再次受击不重复触发 `onDeath`（`wasAlive` 守卫）。
    - `onDeath` 收到 `sourceId`；非伤害来源传 `undefined`。
    - 击杀钩子边界：自伤 / 友军误伤 / 击杀者已死 / 来源查无 → 不更新原点。
- **存档**：旧档缺字段回退；非法 `originStrategy` 安全丢弃。
- **i18n**：新键在全部语言包存在（`i18n/index.test.ts` 覆盖）。
- **面板**：`panel_info.test.ts` 相关回显 / 应用（若涉及）。

## 11. 验证

- 迭代期：`pnpm type-check` + 受影响的单测（`pnpm vitest run src/entity/character/ai/origin.test.ts` 等）。
- 收尾：`pnpm test`；改动触及共享底层（`damage.ts`、`world.ts` 单 RAF 链路、`save_load`）→ 追加 `pnpm build`。

## 12. 实施顺序

1. 领域类型与默认配置（`ai_strategy/types.ts`、`ai_strategy/origin.ts`）。
2. 角色实体与 AI 上下文字段（`character/types.ts`、`ai/types.ts`）。
3. 伤害链路改造（`onDeath(sourceId)` + `wasAlive` 守卫 + 文档）。
4. AI 运行时：`ai/origin.ts`、`machine.ts`、三处消费者替换、leash 改属性。
5. `world.ts` 装配、setter、击杀钩子。
6. 存档三字段 + 校验 + 序列化。
7. 面板 + i18n。
8. 展示模式演示。
9. 测试夹具补全与新增用例。
10. 更新 `ai.md` / `character.md` / `save_load.md` 并移除本设计文档的「尚未实现」标记（或保留归档说明）。

## 13. 落地结果与未决

- 命名最终采用：`hunter` / 狩猎者。
- `CHASE_LEASH_RADIUS` 已更名为 `DEFAULT_CHASE_LEASH_RADIUS`（仅作角色属性默认值来源）。
- 面板数值输入：漫游间隔 `min=1 step=1`（仅接受 > 0），追击半径 `min=0 step=1`（仅接受 > 0）。
