# 角色 AI 系统文档（寻路 / 索敌）

## 一、整体架构

AI 系统采用**双层有限状态机（FSM）**架构：

1. **角色动作状态机**（底层）— 7 个状态，负责移动/战斗的物理执行
2. **AI 决策状态机**（上层）— 又分为 **和平 FSM** 和 **战斗 FSM**，负责决策

```
AI 决策层（entity/character/ai/machine.ts）
  ├── 和平子 FSM: patrol / build
  └── 战斗子 FSM: chase / approach / volley / kite / attack / flee / inactive
        ↓ 设置输入 (dx, dz, attack)
角色动作层（character/state_machine/）
  └── idle / walking / jumping / falling / attacking / dying / dashing
        ↓ 操作物理体
 cannon-es Body
```

**关键：无传统寻路算法**。所有移动均为目标方向的直接向量移动，无障碍物避让。

---

## 二、AI 决策状态机

### 2.1 顶级机

**文件**：`src/entity/character/ai/machine.ts`

**入口函数**：`updateAI(dt, entity, losChecker)` — 每帧由 `entity/character/physics/world.ts:453` 调用

**工作流程**：

1. 调用 `findNearestEnemy()` 检测敌人（条件：阵营敌对 + 在检测范围内 + 有视线无障碍）
2. 发现敌人 → 从 `peace` 切换到 `combat`，进入 `chase` 状态
3. 无敌人且战斗 FSM 进入 `inactive` → 切换回 `peace`
4. **怯懦角色**首次发现敌人且剩余 `attackBurstCount` 时，直接进入 `flee` 而非 `chase`

### 2.2 和平子 FSM

**目录**：`src/entity/character/ai/peace/`

| 状态 | 文件 | 行为 |
|------|------|------|
| `patrol` | `peace/states/patrol.ts` | 在出生点 `patrolRadius * 0.8` 半径内随机生成路径点，直线走向路点，到达后等待 |
| `build` | `peace/states/build.ts` | 在角色附近生成箱子，完成后立即返回巡逻 |

**状态转移**：

- `patrol → build`：`buildTimer <= 0` 且提供 `spawnBox` 回调（仅 `build` 策略）
- `build → patrol`：立即（无条件守卫）

### 2.3 战斗子 FSM

**目录**：`src/entity/character/ai/combat/`

| 状态 | 适用武器 | 行为 |
|------|----------|------|
| `chase` | 近战/远程 | 直接朝目标移动（水平方向） |
| `approach` | 仅远程 | 朝目标移动，到达射击范围时开火 |
| `volley` | 仅远程 | 围绕目标环形移动并射击 |
| `kite` | 仅远程 | 远离目标，若在射程内则开火 |
| `attack` | 近战/远程 | 面向目标并攻击 |
| `flee` | 近战/远程 | 朝远离最近敌人的方向逃跑（逃跑时远程角色会射击） |
| `inactive` | — | 空操作终止状态，触发返回和平 FSM |

**战斗状态转移图**：

```
chase
  ├→ attack      (近战/aggressive 进入攻击范围)
  ├→ approach    (远程，在 idealRange 内)
  ├→ flee        (cowardly，敌人太近)
  ├→ inactive    (超时 或 敌人超出检测范围)
  └→ (自己)      继续追击

approach
  ├→ volley      (在 idealRange 内，非 aggressive)
  ├→ attack      (aggressive 策略)
  ├→ flee        (cowardly，敌人太近)
  ├→ chase       (超时 或 目标拉远)
  └→ inactive    (敌人超出范围)

volley
  ├→ kite        (敌人在 retreatRange 内)
  ├→ approach    (敌人超出 idealRange)
  ├→ flee        (cowardly)
  ├→ chase       (超时)
  └→ inactive    (敌人超出范围)

kite
  ├→ volley      (逃出 retreatRange * 1.5 外)
  ├→ attack      (超时，敌人在射程内)
  ├→ flee        (cowardly)
  ├→ chase       (超时，敌人不在射程)
  └→ inactive    (敌人超出范围)

attack
  ├→ chase       (超时 或 敌人在检测范围不在攻击范围)
  ├→ flee        (cowardly，attackTimeout 后)
  └→ inactive    (敌人超出检测范围)

flee
  ├→ attack      (fleeDuration 结束，有目标，burst 未耗尽)
  ├→ inactive    (fleeDuration 结束，无目标或 burst 耗尽)
  └→ inactive    (检测范围内无敌人)
```

### 2.4 状态机类型定义

**AI 顶级类型**：`src/entity/character/ai/types.ts`

```ts
activeFsm: 'peace' | 'combat'
characterId, spawnPoint, losChecker, spawnBox

// 战斗字段
combatState, combatStateTime, combatTargetId
combatStrafeDir, combatStrafeTimer, combatFleeDir
combatBurstAttackCount, combatStrategy, combatConfig

// 和平字段
peaceState, peaceStateTime, peaceConfig
waypoint, waitTimer, buildTimer
```

**和平 FSM 类型**：`src/entity/character/ai/peace/types.ts`

```ts
const PEACE_STATES = ['patrol', 'build'] as const
type PeaceState = typeof PEACE_STATES[number]

interface PeaceStateHandler {
    enter(ctx, entity): void
    update(dt, ctx, entity, input): void
    exit(ctx, entity): void
    transitions: readonly PeaceTransition[]
}
```

**战斗 FSM 类型**：`src/entity/character/ai/combat/types.ts`

```ts
const COMBAT_STATES = ['chase', 'approach', 'volley', 'kite', 'attack', 'flee', 'inactive'] as const
type CombatState = typeof COMBAT_STATES[number]

interface CombatStateHandler {
    enter(ctx, entity): void
    update(dt, ctx, entity, input): void
    exit(ctx, entity): void
    transitions: readonly CombatTransition[]
}
```

---

## 三、寻路与移动机制

### 3.1 巡逻寻路（`patrol.ts`）

- 在出生点 `patrolRadius * 0.8` 范围内**随机生成路点**
- 直接朝路点移动（调用 `stateMachine.setInput(dx, 0, dz, false)`），无避障
- 距路点 0.3 单位内视为到达，等待 `[waitTimeMin, waitTimeMax]` 秒后选择新路点

### 3.2 追击移动（`chase.ts` / `approach.ts`）

- 计算角色 → 目标的水平方向向量（y=0）
- 设置 `dx`/`dz` 为归一化方向向量
- 远程角色在最佳距离（`idealRange`）时停止移动
- Aggressive 策略持续逼近到 `skillRange` 距离

### 3.3 逃跑移动（`flee.ts`）

- 方向 = 远离最近敌人 → 朝出生点
- 进入时随机偏移 ±30°，每 1.5 秒更换方向
- 纯方向性逃跑，无避障

### 3.4 环形移动（`volley.ts`）

- 每 2 秒随机切换侧向方向（左/右）
- 在目标周围切向移动并射击

---

## 四、配置项汇总

### 4.1 动作状态机常量

**文件**：`src/character/state_machine/constants.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| `GROUND_DAMPING` | `0.85` | 地面摩擦 |
| `AIR_DAMPING` | `0.95` | 空中摩擦 |
| `AIR_CONTROL_FACTOR` | `0.15` | 空中操控系数 |
| `DASH_SPEED_MULTIPLIER` | `2` | 冲刺速度倍率 |
| `DASH_DURATION` | `0.25` | 冲刺持续时间（秒） |
| `DASH_COOLDOWN` | `1.0` | 冲刺冷却时间（秒） |
| `SLOPE_WALK_THRESHOLD` | `0.06` | 站立所需最小法线 Y（≈86.6°） |
| `SLOPE_TRANSIENT_MIN_NY` | `0.01` | 行走瞬态棱法线容忍下限（胶囊跨 trimesh 棱线时的限速投影，防甩离墙面） |
| `SLOPE_RECOVER_THRESHOLD` | `0.08` | 从下落恢复所需最小法线 Y |
| `GROUND_KEEP_TIME` | `0.3` | 土狼时间（秒） |
| `SLOPE_SINK_SPEED` | `3` | 斜坡重附着速度 |
| `FALL_SLIDE_MIN_NY` | `0.3` | 陡坡滑落最小法线 Y |
| `FALL_MAX_SPEED_MULTIPLIER` | `2` | 最大下落速度 = 速度 × 2 |
| `STATE_FLIP_MIN_TIME` | `0.15` | 防抖动最小状态时间 |

**额外常量**：

| 常量 | 值 | 位置 |
|------|-----|------|
| `DYING_DURATION` | `0.6` | `src/character/state_machine/states/dying.ts` |
| `speed` | `3` | `src/entity/character/constants.ts` |
| `jumpHeight` | `2` | `src/entity/character/constants.ts` |
| `scale` | `1` | `src/entity/character/constants.ts` |

### 4.2 和平策略默认配置

**文件**：`src/character/ai_strategy/peace.ts`

**巡逻（patrol）**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `patrolRadius` | `5` | 最大巡逻半径 |
| `waitTimeMin` | `0.5` | 路点最短等待（秒） |
| `waitTimeMax` | `2.5` | 路点最长等待（秒） |

**建造（build）**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `buildInterval` | `3` | 建造间隔（秒） |
| 箱子宽度 `minWidth` / `maxWidth` | `0.5` / `2` | — |
| 箱子高度 `minHeight` / `maxHeight` | `0.5` / `2` | — |
| 箱子深度 `minDepth` / `maxDepth` | `0.5` / `2` | — |
| `mass` | `1` | 质量系数 |
| `friction` | `0.3` | 摩擦系数 |

### 4.3 战斗策略默认配置

**文件**：`src/character/ai_strategy/combat.ts`

| 参数 | tactical | aggressive | cowardly | 说明 |
|------|----------|------------|----------|------|
| `chaseTimeout` | **5** | **0** (永不过期) | **1.5** | 追击超时（秒） |
| `approachTimeout` | **4** | **0** (永不过期) | **1** | 接近超时（秒） |
| `volleyTimeout` | **8** | **4** | **1.5** | 齐射超时（秒） |
| `kiteTimeout` | **3** | **1.5** | **1** | 风筝超时（秒） |
| `attackTimeout` | **3** | **4** | **1.5** | 攻击超时（秒） |
| `fleeDuration` | **0** | **0** | **2.5** | 逃跑持续时间（秒） |
| `attackBurstCount` | **0** | **0** | **2** | 逃跑后攻击爆发次数 |

> 值为 `0` 表示"永不过期"（如 aggressive 的 chase/approach 永不超时）。

### 4.4 近战武器 AI 配置

**文件**：`src/character/weapon/melee_weapon.ts`

| 武器 | detectionRange | 攻击距离 | 伤害 | 冷却 | 持续时间 |
|------|----------------|----------|------|------|----------|
| short_sword | **6** | 1.2 | 2 | 0.25 | 0.15 |
| long_sword | **8** | 1.5 | 3 | 0.5 | 0.3 |
| heavy_sword | **10** | 2.0 | 8 | 1.2 | 0.5 |
| spear | **10** | 2.5 | 5 | 0.7 | 0.35 |
| dual_axe | **7** | 1.3 | 6 | 0.6 | 0.4 |
| war_hammer | **8** | 1.8 | 10 | 1.5 | 0.6 |

### 4.5 远程武器 AI 配置

**文件**：`src/character/weapon/ranged_weapon.ts`

| 武器 | detectionRange | 射程 | idealRange | retreatRange | 伤害 | 冷却 |
|------|----------------|------|------------|--------------|------|------|
| longbow | **20** | 10 | **7** | **4** | 2 | 0.8 |
| crossbow | **15** | 8 | **5** | **3** | 5 | 1.2 |
| shotgun | **10** | 6 | **3** | **2** | 1 | 1.0 |
| staff | **18** | 8 | **5** | **3** | 3 | 1.0 |
| magic_wand | **16** | 10 | **6** | **4** | 1.5 | 0.6 |
| throwing_axe | **12** | 10 | **6** | **3** | 6 | 0.9 |
| grenade | **14** | 10 | **6** | **3** | 4 | 2.0 |
| molotov | **12** | 10 | **6** | **3** | 2 | 1.8 |
| throwing_dart | **16** | 12 | **8** | **4** | 1.5 | 0.2 |

**距离参数解释**：

- `detectionRange`：发现敌人的最大距离
- `range`：武器攻击的最大射程
- `idealRange`：远程角色维持的最佳攻击距离
- `retreatRange`：触发后退/风筝的距离阈值（敌人进入此范围则后撤）

---

## 五、关键类型定义

### 5.1 `CharacterEntity` AI 字段

**文件**：`src/character/types.ts:40-43`

```ts
peaceStrategy: PeaceSubStrategy   // 'patrol' | 'build'
combatStrategy: CombatSubStrategy // 'tactical' | 'aggressive' | 'cowardly'
combat: CombatComponent           // 阵营、技能、血量等
stateMachine: CharacterStateMachine // 角色动作 FSM
```

### 5.2 `CombatComponent`

**文件**：`src/character/combat/types.ts`

- `skills: SkillSlot[]` — 武器技能槽位
- `attackTendency: AttackTendency` — `(selfFaction, targetFaction) => boolean`
- `faction: Faction` — 数值型阵营
- `health / maxHealth / isDead`
- `attackActive / attackTimer / attackedTargets`

### 5.3 `CombatConfig`

**文件**：`src/character/ai_strategy/combat.ts`

```ts
interface CombatConfig {
    chaseTimeout: number
    approachTimeout: number
    volleyTimeout: number
    kiteTimeout: number
    attackTimeout: number
    fleeDuration: number
    attackBurstCount: number
}
```

### 5.4 子策略类型

**文件**：`src/character/ai_strategy/types.ts`

```ts
const PEACE_SUB_STRATEGIES = ['patrol', 'build'] as const
const COMBAT_SUB_STRATEGIES = ['tactical', 'aggressive', 'cowardly'] as const
const BUILDABLE_BOX_TYPES = ['box/common', 'box/destruction', 'box/burning', 'box/magnet', 'box/elasticity'] as const
```

### 5.5 `LineOfSightChecker`

**文件**：`src/entity/character/ai/line_of_sight.ts`

```ts
interface LineOfSightChecker {
    hasLOS(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number): boolean
}
```

使用 Three.js `Raycaster`（`intersectObjects(meshes, false)`）检测两点间是否有遮挡物。

### 5.6 导航传感器（斜坡处理）

**文件**：`src/entity/character/ai/nav/sensor.ts`

| 机制 | 说明 |
|------|------|
| 世界空间法线过滤 | 命中面法线经 `normalMatrix` 转世界空间后判定可行性（`ny ≥ WALKABLE_NORMAL_MIN_Y`），地形/箱子带旋转时不会误判 |
| 坑洞探针 | 从脚底高度向下探测 `checkDistance` 处地面，落差超过 `jumpHeight` 判为 `blocked_pit` |
| 上坡兜底 | 上坡时探针起点位于坡面内部必然 miss，此时若正前方（hAngle=0）射线命中可行走坡面，说明地形持续向上延伸 → 视为有地面，避免误判 `blocked_pit` 导致 AI 在斜坡上无限绕行（持续 walking 不前进） |
| 角色分离坡面补偿 | `separation.ts` 的 `separationSlopeDy()`：角色间强制分离的水平瞬移按支撑面平面方程补偿 Y（`SEPARATION_SLOPE_MIN_NY = 0.5` 以下不补偿），防止斜坡上纯水平平移把碰撞体埋进坡面（穿模 + 物理暴力弹出） |

### 5.7 阵营与攻击倾向

**文件**：`src/character/faction.ts`

- `Faction` — 数值型阵营标识
- `AttackTendency` — `(selfFaction: Faction, targetFaction: Faction) => boolean`
- `TendencyConfig` — 攻击倾向配置，支持预设（敌对全部 / 仅敌对指定阵营等）

---

## 六、新增 AI 功能指南

### 6.1 新增战斗策略

1. 在 `src/character/ai_strategy/types.ts` 的 `COMBAT_SUB_STRATEGIES` 中添加新策略名
2. 在 `src/character/ai_strategy/combat.ts` 的 `DEFAULT_COMBAT_CONFIGS` 中添加默认配置
3. 在 `ai.test.ts` 中添加对应的 FSM 转移测试

### 6.2 新增战斗状态

1. 在 `src/entity/character/ai/combat/states/` 下创建新状态文件，导出 `CombatStateHandler`
2. 在 `src/entity/character/ai/combat/types.ts` 的 `COMBAT_STATES` 中添加状态名
3. 在 `src/entity/character/ai/combat/machine.ts` 的 `STATE_HANDLERS` 中注册
4. 在相关现有状态中添加 `transitions` 条目指向新状态
5. 在 `ai.test.ts` 中添加对应的 FSM 转移测试

### 6.3 新增和平策略

1. 在 `src/character/ai_strategy/types.ts` 的 `PEACE_SUB_STRATEGIES` 中添加新策略名
2. 在 `src/character/ai_strategy/peace.ts` 的 `DEFAULT_PEACE_CONFIGS` 中添加默认配置
3. 在 `src/entity/character/ai/peace/states/` 下创建新状态文件

---

## 七、核心文件索引

| 层级 | 文件 | 内容 |
|------|------|------|
| AI 入口 | `src/entity/character/ai/machine.ts` | `createAIMachine()`, `updateAI()`, `findNearestEnemy()` |
| AI 类型 | `src/entity/character/ai/types.ts` | `AIContext` 接口 |
| 视线检测 | `src/entity/character/ai/line_of_sight.ts` | `LineOfSightChecker` 实现 |
| 导航 FSM | `src/entity/character/ai/nav/machine.ts` | navigating/steering/jumping/stuck 子状态机 |
| 导航传感器 | `src/entity/character/ai/nav/sensor.ts` | 前方扇面射线 + 侧向扫描 + 坑洞探针（斜坡感知） |
| 角色分离 | `src/entity/character/physics/separation.ts` | 重叠分离计算 + 斜坡 Y 补偿 |
| 和平 FSM | `src/entity/character/ai/peace/machine.ts` | 巡逻/建造子状态机 |
| 和平类型 | `src/entity/character/ai/peace/types.ts` | `PeaceState`, `PeaceStateHandler` |
| 巡逻状态 | `src/entity/character/ai/peace/states/patrol.ts` | 随机路点巡逻 |
| 建造状态 | `src/entity/character/ai/peace/states/build.ts` | 定时放置箱子 |
| 战斗 FSM | `src/entity/character/ai/combat/machine.ts` | 战斗子状态机 |
| 战斗类型 | `src/entity/character/ai/combat/types.ts` | `CombatState`, `CombatStateHandler` |
| 追击状态 | `src/entity/character/ai/combat/states/chase.ts` | 朝目标移动 |
| 接近状态 | `src/entity/character/ai/combat/states/approach.ts` | 接近并射击 |
| 齐射状态 | `src/entity/character/ai/combat/states/volley.ts` | 环形射击 |
| 风筝状态 | `src/entity/character/ai/combat/states/kite.ts` | 后撤射击 |
| 攻击状态 | `src/entity/character/ai/combat/states/attack.ts` | 执行攻击 |
| 逃跑状态 | `src/entity/character/ai/combat/states/flee.ts` | 方向性逃跑 |
| AI 策略配置 | `src/character/ai_strategy/types.ts` | 策略类型定义 |
| 和平默认配置 | `src/character/ai_strategy/peace.ts` | 巡逻/建造默认参数 |
| 战斗默认配置 | `src/character/ai_strategy/combat.ts` | 三种策略默认参数 |
| 武器配置 | `src/character/weapon/melee_weapon.ts` | 近战武器 AI 参数 |
| 武器配置 | `src/character/weapon/ranged_weapon.ts` | 远程武器 AI 参数 |
| 阵营系统 | `src/character/faction.ts` | 阵营与攻击倾向 |
| 角色动作 FSM | `src/character/state_machine/` | 7 状态动作层 FSM |
| 集成入口 | `src/entity/character/physics/world.ts` | AI 逐帧调用点 |
| AI 测试 | `src/entity/character/ai/ai.test.ts` | FSM 转移测试 |
