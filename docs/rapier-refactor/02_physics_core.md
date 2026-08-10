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
4. **新增 `eventQueue`** — 所有碰撞事件通过它分发
5. **`createSharedWorld` 仍为同步函数** — Rapier 的 World 创建是同步的（WASM 已通过 `RAPIER.init()` 预加载）

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
