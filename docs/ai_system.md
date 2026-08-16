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

1. 调用 `findNearestEnemy()` 检测敌人（三重门控：阵营敌对 + 在侦测半径内 + 身前 270° 扇形内 + 扇形扫描射线无遮挡）
2. 发现敌人 → 从 `peace` 切换到 `combat`，进入 `chase` 状态（`combatReentryTimer` 重新接敌冷却期内不进入，见 3.5）
3. 无敌人且战斗 FSM 进入 `inactive` → 切换回 `peace`
4. **怯懦角色**首次发现敌人且剩余 `attackBurstCount` 时，直接进入 `flee` 而非 `chase`
5. **静止自检**：每帧 FSM 执行后检查"有移动意图但无位移"，超时触发卡死恢复（见 3.5）

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
  ├→ chase       (超时 或 目标出攻击检测区域)
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

### 2.5 攻击检测箱（attackDetectChecker）

AI 出招门控不用圆形距离判定（`dist <= weapon.range`），而是用**攻击检测箱**——与角色位置/朝向绑定的朝向 OBB，尺寸与位置由近战武器配置的 `detectBox` 属性显式驱动（不同武器各自配置，不再从命中箱几何推导）：

```ts
/** 攻击检测箱检查器：目标是否在角色的攻击检测箱内（缺失时 AI 回退圆形距离判定） */
export type AttackDetectChecker = (character: CharacterEntity, target: CharacterEntity) => boolean
```

- **几何**：`entity/character/combat/melee_executor.ts` 导出 `attackDetectOBB(pos, detectBox, scale, yaw)`：
    - `detectBox` 为 `MeleeWeaponConfig.detectBox`（`character/weapon/melee_weapon.ts` `MeleeDetectBox`）：`size{x,y,z}` 盒尺寸 + `offset{x,y,z}` 相对身体中心偏移（身体局部坐标，+Z = 朝向）
    - 半长 = `size / 2 × scale`；盒中心 = 身体位置 + `offset × scale` 绕 yaw 旋转（局部 +Z → (sin, 0, cos)），主体覆盖角色前方与两侧，身后覆盖由 `offset.z - size.z / 2` 决定（预设保留少量贴背余量）
    - 预设值按武器攻击距离区分（如短剑前缘 ≈ 0.95、长枪前缘 ≈ 1.9，单位 m，scale=1）
- **判定**：`testAttackDetect()` 用检测箱 OBB 与目标受击箱 OBB（与碰撞箱同尺寸的竖直胶囊包围盒，随目标朝向旋转）做 15 轴 SAT 相交（`combat/obb.ts`）。
- **注入链路**：`world.ts` `activateAI` 创建 AI 时传入闭包——近战直接取当前技能武器的 `detectBox` 走 `testAttackDetect`（朝向取 `facingAngles`，无需武器模型在场）；远程回退 `Math.hypot <= weapon.range` 圆形判定（保持原有行为，edit debug 以橙色射程圆环显示，半径 = `weapon.range`）。近战武器配置已无 `range` 字段，攻击触发判定完全由武器 `detectBox` 驱动。
- **生效点**（仅近战）：`attack.update` 出招门控、`attack → chase`（出箱）guard、`chase → attack`（入箱）guard、`kite` 射程内判定；`detectionRange`（索敌感知半径）语义不变。
- **回退**：checker 缺失（测试环境）时回退圆形距离判定（近战用 `MELEE_FALLBACK_DETECT_RANGE`，远程用 `weapon.range`），保证无装配环境下 AI 行为不变。
- **与伤害判定的边界**：攻击检测箱仅用于 AI 出招触发（橙色 debug 线框）；实际伤害由**攻击判定箱**（武器本地盒随 `weaponGroup.matrixWorld` 变换的世界 OBB，红色 debug 线框）与受击箱 SAT 相交决定，两者职责分离、几何不同。

---

## 三、寻路与移动机制

### 3.1 巡逻寻路（`patrol.ts`）

- 在出生点 `patrolRadius * 0.8` 范围内**随机生成路点**
- 直接朝路点移动（调用 `stateMachine.setInput(dx, 0, dz, false)`），无避障
- 距路点 0.3 单位内视为到达，等待 `[waitTimeMin, waitTimeMax]` 秒后选择新路点
- 路点不可达时由静止检测（见 3.5）超时重掷，不会永远朝不可达路点挤

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

### 3.5 卡死检测与自愈（静止检测）

AI 的移动输入在到达动作层前要经过两道"清零闸门"：**接触推挤阻断**（与另一角色物理接触且输入指向对方时清零，`world.ts` setInput 闭包）与 **nav stuck**（前方受阻且两侧无通路）。清零后决策层若不自检，会永远站桩在 `idle|combat:chase`、`falling|peace:patrol` 等状态。静止检测就是决策层的兜底：

**检测**（`machine.ts` `updateStallDetection`）：包装 `setInput` 记录每帧**意图方向**（过滤前）。意图模长 ≥ `STALL_INPUT_EPS` 且相对锚点的水平位移不超过 `STALL_CHECK_TRAVEL` 时累积 `stallTimer`，超过 `STALL_TIMEOUT` 触发恢复；无意图（路点等待/射程内站桩）或确认在动时重置锚点与计时。**交火豁免**：有攻击意图或攻击动作进行中（`attackActive`）视为有效战斗行为并重置基准——面对面对峙位移为零属正常，不得误判为卡死而中断战斗。

**恢复动作**（`recoverFromStall`，按活跃 FSM 分发）：

| 场景 | 恢复动作 |
|------|----------|
| peace（patrol/build） | 重掷路点（`patrol.ts` 的 `rerollWaypoint`） |
| combat `flee` | 逃跑方向旋转 ±60°〜120° 换被堵轴（不放弃战斗） |
| combat 其他状态 | 先横向绕行重试（朝目标偏转 ±60°〜120° 输出 `COMBAT_STALL_DETOUR_DURATION` 绕行脉冲，重置为 chase），连续卡死达 `COMBAT_STALL_MAX_RETRIES` 才放弃：回 peace/patrol 并置 `combatReentryTimer`。重试计数在确认移动/重新接敌时重置 |

绕行重试的侧向移动可脱离接触推挤闸门的正面清零，打破贴脸顶牛/正面被堵；避免对峙一卡就退战。

**重新接敌冷却**（`combatReentryTimer`）：卡死放弃战斗后，冷却（`COMBAT_REENTRY_COOLDOWN`）耗尽前即使检测到敌人也不进入 combat，同时根治"超时 → peace → 下帧立刻回 chase"的空转循环。aggressive 的 `chaseTimeout = 0`（永不放弃追击）依赖此兜底而不会死锁。

**追击活动半径**（`CHASE_LEASH_RADIUS`）：`chase` 状态下每帧检查距出生点的水平距离，超出半径即放弃战斗并进入接敌冷却。防止同速目标永远追不上时把角色拖向无限远（平行走到天边的根因之一）。

**受击转战斗（仇恨）**（`notifyAIDamaged`，由 `world.ts` 的 `onDamageTaken` 回调调用）：被击中时清除接敌冷却并强制进入 combat 锁定攻击者，解决和平态被背后/视野外攻击不还手、冷却期内挨打不反应的问题。友军误伤（`attackTendency` 为 false）不强制开战；攻击者已死亡时不锁定（冷却仍被清除）。伤害回调签名透传 `DamageEvent`（`onDamageTaken(amount, event)`，`character/combat/damage.ts` + `targetable.ts`）。

**脱战距离滞回**（`COMBAT_LOSE_RANGE_FACTOR`）：各战斗状态（chase/approach/attack/kite/volley）的"目标超距 → inactive"守卫阈值为 `detectionRange × 2`，与进入战斗用的 `detectionRange` 形成滞回：防止边界抖动、以及受击仇恨目标在侦测半径外（如远程狙击）时 combat 一闪即灭（表现为"被打仍处 peace"）。目标死亡/消失仍立即退出。

**相关常量**（`ai/constants.ts`）：

| 常量 | 值 | 说明 |
|------|-----|------|
| `STALL_INPUT_EPS` | `0.001` | 有移动意图的最小输入模长 |
| `STALL_CHECK_TRAVEL` | `0.5` | 视为"在动"的位移阈值（m） |
| `STALL_TIMEOUT` | `2.0` | 静止恢复触发时长（秒） |
| `COMBAT_REENTRY_COOLDOWN` | `3.0` | 战斗放弃后重新接敌冷却（秒） |
| `CHASE_LEASH_RADIUS` | `20` | 追击活动半径（m），距出生点超出则放弃追击 |
| `COMBAT_STALL_MAX_RETRIES` | `3` | combat 卡死横向绕行重试上限，达上限才放弃战斗 |
| `COMBAT_STALL_DETOUR_DURATION` | `1.0` | 卡死重试绕行脉冲时长（秒） |
| `COMBAT_LOSE_RANGE_FACTOR` | `2` | 脱战距离滞回系数（放弃阈值 = detectionRange × 系数） |

**nav stuck 倒退逃逸**（`nav/machine.ts`）：stuck 状态累计超过 `config.stuckTimeout` 后，输出 `STUCK_ESCAPE_DURATION`（0.5s）的"意图反向倒退 + 跳跃"逃逸脉冲尝试物理挣脱（对墙/坑均安全），随后重新评估路径。与决策层静止检测构成两级防线：先倒退挣脱，仍无效才重掷路点/放弃目标。

**朝向规则**：AI 朝向由意图方向（过滤前）驱动（`world.ts` `aiTargetDirs`），被清零闸门拦住时仍持续转向目标/路点，保证攻击检测箱门控与发射方向可用（若用过滤后方向，被卡住时朝向冻结会与检测箱门控互锁）。

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
| `DASH_DURATION` | `0.25` | 冲刺动作时间（秒）；定义已迁至 `character/combat/dash_skill.ts`（冲刺技能三计时属性），本处仅转出 |
| `DASH_COOLDOWN` | `1.0` | 冲刺冷却时间（秒）；同上 |
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
| `chaseTimeout` | **10** | **0** (永不过期) | **1.5** | 追击超时（秒） |
| `approachTimeout` | **4** | **0** (永不过期) | **1** | 接近超时（秒） |
| `volleyTimeout` | **8** | **4** | **1.5** | 齐射超时（秒） |
| `kiteTimeout` | **3** | **1.5** | **1** | 风筝超时（秒） |
| `attackTimeout` | **3** | **4** | **1.5** | 攻击超时（秒） |
| `fleeDuration` | **0** | **0** | **2.5** | 逃跑持续时间（秒） |
| `attackBurstCount` | **0** | **0** | **2** | 逃跑后攻击爆发次数 |

> 值为 `0` 表示"永不过期"（如 aggressive 的 chase/approach 永不超时），卡死兜底由静止检测承担（见 3.5）。

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

### 5.5 `LineOfSightChecker` 与视线扇形

**文件**：`src/entity/character/ai/line_of_sight.ts`

```ts
interface LineOfSightChecker {
    hasLOS(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number): boolean
    /** 扇形扫描：向 yaw ±半角内发射 VISION_FAN_RAY_COUNT 条水平射线（每 10° 一条），
     * 把每条射线最近遮挡物距离写入 out（无遮挡写 maxDist） */
    castFan(fromX: number, fromY: number, fromZ: number, yaw: number, maxDist: number, out: Float32Array): void
}
```

使用 Three.js `Raycaster`（`intersectObjects(meshes, false)`）检测实体遮挡，扫描射线起点取眼部高度（`height × scale × 0.4`，与 debug 可视化同源）。

**270° 扇形扫描**（`machine.ts` `findNearestEnemy`）：索敌不用单条目标射线，而是用**覆盖整个扇形的扫描射线**——每 10° 一条（共 28 条，含左右边界）：

1. **角度门控**：目标方位角 `atan2(dx, dz)` 与角色朝向角（`ctx.getFacingAngle()`，由 `world.ts` 的 `facingAngles` 注入）的归一化角差超出 ±`VISION_FAN_HALF_ANGLE`（135°）则不可见，即正后方 90° 为盲区。
2. **射线遮挡**：`castFan` 懒发射（有候选才扫描一次，整帧复用），取最接近目标方位角的射线（角度量化到 10° 网格）；命中点早于目标体表（`d - 胶囊半径 - 0.05` 容差）才判遮挡——射线会命中目标自身网格，不加容差会把目标自遮挡误判为不可见。

常量在 `src/entity/character/ai/constants.ts`：

| 常量 | 值 | 说明 |
|------|-----|------|
| `VISION_FAN_ANGLE` | `π × 1.5` | 视线扇形总角（270°） |
| `VISION_FAN_HALF_ANGLE` | `3π / 4` | 半角（±135°） |
| `VISION_FAN_RAY_STEP` | `π / 18` | 扫描射线步长（10°） |
| `VISION_FAN_RAY_COUNT` | `28` | 扫描射线数（270°/10° + 1） |

edit 模式 debug 可视化（蓝色线条，`combat_vfx/hitbox_debug.ts`）：眼部高度处画全部 28 条扫描射线（与判定同源 castFan，**截断到遮挡点**，直观看到哪条射线被什么挡住），存在索敌目标时额外画到目标的连线。

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
| AI 入口 | `src/entity/character/ai/machine.ts` | `createAIMachine()`, `updateAI()`, `findNearestEnemy()`（含 270° 扇形门控与扫描射线遮挡） |
| AI 常量 | `src/entity/character/ai/constants.ts` | `VISION_FAN_ANGLE` / `VISION_FAN_HALF_ANGLE` / `VISION_FAN_RAY_STEP` / `VISION_FAN_RAY_COUNT` |
| AI 类型 | `src/entity/character/ai/types.ts` | `AIContext` 接口、`AttackDetectChecker` |
| 视线检测 | `src/entity/character/ai/line_of_sight.ts` | `LineOfSightChecker` 实现（`hasLOS` + `castFan` 扇形扫描） |
| OBB 几何 | `src/entity/character/combat/obb.ts` | `yawOBB` / `obbFromTransform` / 15 轴 SAT `obbIntersect` |
| 攻击检测箱 | `src/entity/character/combat/melee_executor.ts` | `attackDetectOBB` / `testAttackDetect`（几何由武器 `detectBox` 配置驱动） |
| Debug 可视化 | `src/entity/character/combat_vfx/hitbox_debug.ts` | 判定箱（红）/受击箱（青）/检测箱（橙）/射程圆环（橙，远程）/视线扇形（蓝） |
| 导航 FSM | `src/entity/character/ai/nav/machine.ts` | navigating/steering/jumping/stuck 子状态机（stuck 超时输出倒退逃逸脉冲） |
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
