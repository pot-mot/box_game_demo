# 02 — 核心物理层重写

## 涉及文件

| 操作 | 文件 |
|------|------|
| 重写 | `src/physics/world.ts` |
| 小改 | `src/physics/constants.ts` |
| 中改 | `src/physics/env.ts` |
| 小改 | `src/types/physics.ts` |

## 前置依赖

- [x] 01_rapier_utils.md

---

## 2a. `src/physics/constants.ts`

### 改动

```diff
- import type {BODY_TYPES} from 'cannon-es'
-
  /** 重力加速度 (m/s²) */
  export const GRAVITY = -9.82

  /** 固定物理步长 (s) */
- export const FIXED_TIME_STEP = 1 / 60
+ /** Rapier 使用固定内部步长，此常量仅用于手动子步计数 */
+ export const FIXED_TIME_STEP = 1 / 60

  /** 每帧最大子步数（防止死亡螺旋） */
  export const MAX_SUB_STEPS = 3

- /** 帧 delta 上限 (s)，防止卡帧时物理爆炸 */
+ /** 帧 delta 上限 (s)，防止卡帧时物理爆炸（Rapier 中仍有意义） */
  export const MAX_DT = 0.033

  /** 地面平面 Y 坐标 */
  export const GROUND_Y = 0

  /** 碰撞组 —— 语义保持不变，Rapier 的 setCollisionGroups 使用相同位掩码 */
  export const DEFAULT_COLLISION_GROUP = 1
  export const DEFAULT_COLLISION_MASK = -1
  export const FRAGMENT_COLLISION_GROUP = 2
  export const FRAGMENT_COLLISION_MASK = 1 | 4
  export const TERRAIN_COLLISION_GROUP = 4
  export const TERRAIN_COLLISION_MASK = 1 | 2
```

### 说明

- `FIXED_TIME_STEP` 不再传给 `world.step()`（Rapier 不接受 dt 参数），但保留用于 `main.ts` 中计算手动子步次数
- 碰撞组常量完全保留，Rapier 的 `setCollisionGroups(membership, filter)` 使用相同位掩码语义
- 删除 `BOX_BOX_FRICTION` 和 `BOX_GROUND_FRICTION` —— Rapier 改为在每个 collider 上直接设 friction

---

## 2b. `src/physics/world.ts` — 完全重写

### 当前代码概览（约 60 行）

- 创建 `new World()` → 设置 gravity、SAPBroadphase、allowSleep
- 创建 3 个 `Material`（box, ground, char）
- 注册 5 个 `ContactMaterial` 对（不同摩擦系数）
- 创建静态 `Plane` 地面
- 导出 `SharedWorld { world, boxMat, charMat }`

### 新代码

```ts
import RAPIER from '@dimforge/rapier3d-compat'
import { GRAVITY, GROUND_Y } from './constants.ts'
import type { RapVector3 } from './rapier_utils.ts'

// ── 公共接口 —— 兼容现有调用方 ──

export interface SharedWorld {
    /** Rapier 物理世界 */
    readonly world: RAPIER.World
    /** 碰撞事件队列 —— 所有需要碰撞回调的 system 共用 */
    readonly eventQueue: RAPIER.EventQueue
    /** 地面刚体引用 */
    readonly groundBody: RAPIER.RigidBody
}

/** 创建共享物理世界（单例） */
export const createSharedWorld = (): SharedWorld => {
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 })
    const eventQueue = new RAPIER.EventQueue(true)

    // 地面：大而扁的静态盒子替代 Plane
    const groundDesc = RAPIER.RigidBodyDesc.fixed()
    groundDesc.setTranslation(0, GROUND_Y - 1, 0)
    const groundBody = world.createRigidBody(groundDesc)
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(200, 1, 200).setFriction(0.5),
        groundBody,
    )

    return { world, eventQueue, groundBody }
}
```

### 关键变化

1. **删掉 `boxMat` / `charMat` / `groundMat`** — 各 entity 创建 Collider 时自行设 friction
2. **删掉 `ContactMaterial`** — Rapier 自动从碰撞体的摩擦系数计算接触摩擦
3. **地面从 `Plane` 改为大扁盒** — Rapier 没有 `halfspace` collider（但 Trimesh 可以模拟，这里用盒子最简单）
4. **新增 `eventQueue` + `eventBus`** — 碰撞事件通过总线统一分发（见下文）
5. **`createSharedWorld` 仍为同步函数** — Rapier 的 World 创建是同步的（WASM 已通过 `RAPIER.init()` 预加载）

### 事件总线设计（最终实现，2026-08 修复后）

最初的方案是让各系统（character / destruction / elasticity）各自 `drainCollisionEvents` 共享队列，
实践中暴露出两个问题：

1. **单消费者争抢**：先 drain 的系统拿走全部事件，后 drain 的系统拿不到（地面检测失效 / 箱子撞击失效）。
2. **autoDrain 丢事件**：`EventQueue(true)` 在每次 `world.step(eventQueue)` 前自动清空队列，
   多子步循环里只有最后一个子步的事件能活到 drain —— 落地等接触开始事件随机丢失。

最终实现（`src/physics/collision_events.ts` / `contact_tracking.ts` / `velocity_snapshots.ts`）：

- **`CollisionEventBus`**：`main.ts` 在每个子步 `world.step()` 后立即 `eventBus.drain()`，
  把事件广播给所有订阅者，并触发 `onStepEnd` 步进钩子。
- **订阅者**：character（`ContactTracker` 维护活跃接触对 → 地面检测/推挤/分离）、
  destruction / elasticity（即时处理撞击，用上一子步的 `VelocitySnapshots` 计算撞击前速度）。
- **`onStepEnd` 钩子**：刷新速度快照 + `clearAllForces`（见下）。
- **所有碰撞体启用 `ActiveEvents.COLLISION_EVENTS`**：box↔box、box↔ground 的撞击事件才会产生
  （Rapier 要求接触对中至少一方启用事件）。

### 力的生命周期陷阱（重要）

Rapier 的 `addForce` 在 step 结算后**不会自动清除**，力会无限期残留：

- 静止角色每帧加的「反重力力」会在离地后继续抵消重力 → 角色永远不下落、卡在 jumping；
- 磁力/浮力每帧累加 → 加速度爆炸。

本项目所有施力均为「每帧瞬态」语义，因此 `main.ts` 在每个子步结束后调用
`clearAllForces(world)`（`rapier_utils.ts`）统一清零，各系统下一帧重新施加。

### 质量陷阱（重要，2026-08 修复后）

Rapier 动态刚体质量 = Σ碰撞体体积 × 密度（默认 1.0）。迁移后若只写 `RigidBodyDesc.dynamic()`
不设质量：角色实际质量 ≈ 0.04（cannon-es master 为 1），击退冲量（Δv = J/m）被放大 ~25 倍；
箱子的 `config.mass` 则完全不参与物理。修复要点：

1. 所有碰撞体 `.setDensity(0)`，质量完全由附加质量决定（与尺寸/scale 解耦）。
2. **rapier3d-compat 0.20.0 的两个坑**：
   - `RigidBodyDesc.setAdditionalMass` 无效（desc 上的 mass/massOnly 不被 wasm 采纳）；
   - 运行期 `setAdditionalMass` 后 `mass()` 读取的仍是旧值，必须再调
     `recomputeMassPropertiesFromColliders()` 刷新。
3. 统一封装 `setBodyMass(body, mass)`（`rapier_utils.ts`）：角色恒为 1；
   箱子/碎片/子弹 = `config.mass`；燃烧箱子每帧按燃烧进度递减；
   `updateConfig` 的 mass 变更必须同步调用。

---

## 2c. `src/physics/env.ts` — 中改

### 当前代码

```ts
import type {Body} from 'cannon-es'

interface PhysicsEnv {
    readonly bodyProviders: Array<() => Body[]>
    getAllBodies(): Body[]
}
```

### 新代码

```ts
import type RAPIER from '@dimforge/rapier3d-compat'

/** Rapier 刚体 + Collider 对 */
export interface BodyColliderPair {
    body: RAPIER.RigidBody
    /** 第一个（主）Collider 句柄 */
    mainCollider: number
}

interface PhysicsEnv {
    readonly bodyProviders: Array<() => RAPIER.RigidBody[]>
    /** 获取所有非静态刚体（磁力、水使用） */
    getAllBodies(): RAPIER.RigidBody[]
    /** 注册刚体提供者 */
    registerProvider(provider: () => RAPIER.RigidBody[]): void
}
```

### 说明

- 返回值从 cannon `Body[]` 改为 Rapier `RigidBody[]`
- 磁力、水在 `preSync` 中遍历 `getAllBodies()` 施加力时需要调用 `body.translation()` / `body.linvel()` 等 Rapier API
- 地形 `liftBoxesOnTerrain` 需要遍历动态体时也通过这个接口获取

---

## 2d. `src/types/physics.ts` — 小改

### 改动

```diff
  export interface EntityTickHandler {
-     preSync?(dt: number, time: number): void
+     preSync?(dt: number, time: number, eventQueue?: EventQueue): void
      syncPositions(): void
      postSync?(dt: number, time: number): void
  }
```

### 说明

- `preSync` 的第三个参数为弹性箱子和可破坏箱子提供共享的 `eventQueue`，用于排空碰撞事件
- 此参数可选（默认不传），只有需要碰撞回调的 system 使用

---

## 验证

完成后执行 `pnpm dev`，预期错误：
- 大量 `import {Vec3} from 'cannon-es'` 找不到 —— 正常，后续步骤逐步替换
- `SharedWorld` 中 `boxMat` / `charMat` 不可访问 —— 正常，后续步骤适配各 entity
