# 00 — 总体概览与前置准备

## 目标

将整个项目的物理引擎从 `cannon-es@0.20.0` 迁移到 `@dimforge/rapier3d-compat@0.20.0`。

## 涉及文件（共 52 个）

| 步骤 | 文件 | 改动程度 |
|------|------|---------|
| 01 | `src/physics/rapier_utils.ts` | **新建** |
| 02 | `src/physics/world.ts` | 重写 |
| 02 | `src/physics/constants.ts` | 小改 |
| 02 | `src/physics/env.ts` | 中改 |
| 02 | `src/types/physics.ts` | 小改 |
| 03 | `src/entity/box/common/physics/world.ts` | 重写 |
| 04 | `src/entity/character/physics/world.ts`（body创建+sync部分） | 重写 |
| 05 | `src/main.ts` | 中改 |
| 06 | `src/character/state_machine/states/idle.ts` | 中改 |
| 06 | `src/character/state_machine/states/walking.ts` | 中改 |
| 06 | `src/character/state_machine/states/jumping.ts` | 中改 |
| 06 | `src/character/state_machine/states/falling.ts` | 中改 |
| 06 | `src/character/state_machine/states/attacking.ts` | 中改 |
| 06 | `src/character/state_machine/states/dashing.ts` | 中改 |
| 06 | `src/character/state_machine/states/flinching.ts` | 中改 |
| 06 | `src/character/state_machine/states/dying.ts` | 中改 |
| 06 | `src/character/state_machine/ground.ts` | 中改 |
| 07 | `src/entity/character/physics/ground_state.ts` | 重写 |
| 07 | `src/entity/character/physics/separation.ts` | 重写 |
| 08 | `src/entity/box/elasticity/physics/world.ts` | 重写 |
| 08 | `src/entity/box/burning/physics/world.ts` | 重写 |
| 08 | `src/entity/box/destructed/physics/world.ts` | 重写 |
| 08 | `src/entity/box/magnet/physics/world.ts` | 重写 |
| 08 | `src/entity/area/water/physics/world.ts` | 中改 |
| 08 | `src/entity/area/water/physics/forces.ts` | 中改 |
| 09 | `src/entity/fragment/common/physics/world.ts` | 重写 |
| 09 | `src/entity/terrain/base/physics/index.ts` | 重写 |
| 09 | `src/entity/destroyed/geometry/voronoi_fracture.ts` | 小改 |
| 09 | `src/entity/destroyed/types/index.ts` | 小改 |
| 10 | `src/entity/character/combat/melee_executor.ts` | 中改 |
| 10 | `src/entity/character/combat/ranged_executor.ts` | 重写 |
| 10 | `src/character/combat/explosion.ts` | 小改 |
| 10 | `src/character/combat/executor.ts` | 小改 |
| 11 | `src/save_load/serialize.ts` | 小改 |
| 11 | `src/save_load/deserialize.ts` | 小改 |
| 13 | `src/character/types.ts` | 小改 |
| 13 | `src/entity/box/base/types/index.ts` | 小改 |
| 13 | `src/entity/box/common/types/index.ts` | 小改 |
| 13 | `src/entity/box/elasticity/types/index.ts` | 小改 |
| 13 | `src/entity/box/burning/types/index.ts` | 小改 |
| 13 | `src/entity/box/destructed/types/index.ts` | 小改 |
| 13 | `src/entity/box/magnet/types/index.ts` | 小改 |
| 13 | `src/entity/fragment/common/types/index.ts` | 小改 |
| 13 | `src/entity/terrain/base/types/index.ts` | 小改 |
| 13 | `src/entity/area/water/types/index.ts` | 小改 |
| 13 | `src/entity/character/ai/peace/states/patrol.ts` | 小改 |
| 13 | `src/entity/character/ai/peace/states/build.ts` | 小改 |
| 13 | `src/entity/character/ai/combat/states/approach.ts` | 小改 |
| 13 | `src/entity/character/ai/combat/states/attack.ts` | 小改 |
| 13 | `src/entity/character/ai/combat/states/chase.ts` | 小改 |
| 13 | `src/entity/character/ai/combat/states/flee.ts` | 小改 |
| 13 | `src/entity/character/ai/combat/states/kite.ts` | 小改 |
| 13 | `src/entity/character/ai/combat/states/volley.ts` | 小改 |
| 12 | `*.test.ts`（约 12 个） | 中改 |

## 核心 API 差异速查

| 概念 | cannon-es | Rapier |
|---|---|---|
| 世界创建 | `new World()` 同步 | `new RAPIER.World({x,y,z})` 需 `await RAPIER.init()` 前置 |
| 世界步进 | `world.step(1/60, dt, maxSubSteps)` | `world.step()` 固定内部步长 |
| 刚体 | `new Body({mass, type, shape})` | `createRigidBody(bodyDesc)` + `createCollider(colliderDesc)` **分离创建** |
| 形状-盒 | `new Box(halfExtents)` | `ColliderDesc.cuboid(hx, hy, hz)` |
| 形状-球 | `new Sphere(radius)` | `ColliderDesc.ball(radius)` |
| 形状-凸包 | `new ConvexPolyhedron({vertices, faces})` | `ColliderDesc.convexHull(vertices)` |
| 形状-三角网格 | 无 | `ColliderDesc.trimesh(vertices, indices)` |
| 材质 | `Material('name')` + `ContactMaterial` | 直接在 `ColliderDesc` 上设 `setFriction()` / `setRestitution()`（每个碰撞体独立） |
| 碰撞组 | `collisionFilterGroup` / `collisionFilterMask` 位掩码 | `setCollisionGroups(membership, filter)` 语义相同 |
| 碰撞事件 | `body.addEventListener('collide', cb)` | `eventQueue.drainCollisionEvents(handle1, handle2, started)` 每帧排空 |
| 接触遍历 | `world.contacts` 数组直接访问 | `eventQueue.drainContactForceEvents()` 或 `world.contactPair()` |
| 向量 | `new Vec3(x,y,z)` 类实例，有方法 | 纯 `{x,y,z}` 对象，需工具函数 |
| 速度直写 | `body.velocity.set(vx,vy,vz)` | `body.setLinvel({x,y,z}, true)` |
| 施加力 | `body.force.y = f` / `body.applyForce()` | `body.addForce({x,y,z}, true)` |
| 施加冲量 | `body.applyImpulse(imp, pos)` | `body.applyImpulseAtPoint(imp, pos, true)` |
| 休眠 | `body.wakeUp()` | `body.wakeUp()` 同名 |
| 固定旋转 | `fixedRotation: true` | `bodyDesc.lockRotations()` |
| 线性阻尼 | `linearDamping` | `bodyDesc.setLinearDamping()` |
| 运行时改质量 | `body.mass = x` + `updateMassProperties()` | 不支持 —— 需用 `bodyDesc.setAdditionalMass()` 或在创建时通过密度控制 |
| 运行时改类型 | 切 `DYNAMIC` / `STATIC` | 不支持 —— 需销毁重建 body |
| 序列化 | 无，需手动 | `world.takeSnapshot()` → `Uint8Array` |
| 世界迭代 | `world.bodies.forEach(...)` | 需外部维护 body 句柄列表 |
| broadphase | `new SAPBroadphase(world)` | Rapier 内置，不可配置 |

## 前置操作

### 1. 修改 `package.json`

```json
// 删除
"cannon-es": "^0.20.0"

// 新增
"@dimforge/rapier3d-compat": "^0.20.0"
```

执行 `pnpm install`。

### 2. TypeScript 类型窄化

`tsconfig.json` 中 `erasableSyntaxOnly: true` 仍需保留。Rapier 的类型定义兼容此选项。

### 3. 全局搜索替换说明

以下 cannon-es 导入需要在所有文件中逐一替换：

```
import {Vec3} from 'cannon-es'          → import {vec3Set, vec3Length, ...} from '../physics/rapier_utils.ts'
import {Body} from 'cannon-es'           → import type RAPIER from '@dimforge/rapier3d-compat'
import {BODY_TYPES} from 'cannon-es'    → 使用 RigidBodyType.Dynamic / RigidBodyType.Fixed
```

## 执行顺序（严格依赖）

```
01_rapier_utils     新建工具层（无依赖）
        ↓
02_physics_core     重写核心物理层（依赖 01）
        ↓
03_box_common       最简实体先跑通（依赖 02）
        ↓
04_character_physics 角色刚体（依赖 02）
        ↓
05_main_loop         启用 Rapier step（依赖 02+03+04）
        ↓
06_state_machine     状态机 9 文件（依赖 04+05）
        ↓
07_ground_detection  地面检测+分离（依赖 04+05+06）← 最复杂
        ↓
08_complex_boxes     弹性/燃烧/破坏/磁力/水 + forces（依赖 02+05）
        ↓
09_fragment_terrain  碎片+地形 Trimesh + voronoi（依赖 02+05）
        ↓
10_combat            战斗系统（依赖 02+04+05）
        ↓
11_save_load         存档系统（依赖 所有上游 03-10）
        ↓
12_tests             测试回归（依赖 所有上游）
        ↓
13_types_misc        类型定义 + AI 状态 + 遗漏文件（全局依赖，可与上游并行）
```

完成一步后验证 `pnpm dev` 不报错再进入下一步。
