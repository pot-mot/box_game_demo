# 13 — 类型定义 + AI 状态 + 遗漏文件

## 涉及文件

| 操作 | 文件 | 说明 |
|------|------|------|
| 小改 | `src/character/types.ts` | CharacterEntity body 类型 |
| 小改 | `src/entity/box/base/types/index.ts` | 基础箱子类型 |
| 小改 | `src/entity/box/common/types/index.ts` | 普通箱子类型 |
| 小改 | `src/entity/box/elasticity/types/index.ts` | 弹性箱子类型 |
| 小改 | `src/entity/box/burning/types/index.ts` | 燃烧箱子类型 |
| 小改 | `src/entity/box/destructed/types/index.ts` | 破坏箱子类型 |
| 小改 | `src/entity/box/magnet/types/index.ts` | 磁力箱子类型 |
| 小改 | `src/entity/fragment/common/types/index.ts` | 碎片类型 |
| 小改 | `src/entity/terrain/base/types/index.ts` | 地形类型 |
| 小改 | `src/entity/area/water/types/index.ts` | 水类型 |
| 小改 | `src/entity/destroyed/types/index.ts` | 断裂数据 Vec3 类型 |
| 小改 | `src/character/combat/executor.ts` | ExecutorContext Vec3 类型 |
| 小改 | `src/entity/area/water/physics/forces.ts` | 水物理的力计算 |
| 小改 | `src/entity/destroyed/geometry/voronoi_fracture.ts` | Voronoi 断裂算法 |
| 小改 | `src/entity/character/ai/peace/states/patrol.ts` | AI 巡逻 |
| 小改 | `src/entity/character/ai/peace/states/build.ts` | AI 建造 |
| 小改 | `src/entity/character/ai/combat/states/approach.ts` | AI 接近 |
| 小改 | `src/entity/character/ai/combat/states/attack.ts` | AI 攻击 |
| 小改 | `src/entity/character/ai/combat/states/chase.ts` | AI 追击 |
| 小改 | `src/entity/character/ai/combat/states/flee.ts` | AI 逃跑 |
| 小改 | `src/entity/character/ai/combat/states/kite.ts` | AI 风筝 |
| 小改 | `src/entity/character/ai/combat/states/volley.ts` | AI 齐射 |

## 前置依赖

- [x] 01_rapier_utils.md（提供 `RapVector3` 类型和 `v3*` 工具函数）
- [x] 02_physics_core.md（删除 `boxMat` / `charMat` 等，类型文件需同步适配）

---

## 13a. 类型定义文件 — 统一改动模式（11 个文件）

所有导入 `type {Body} from 'cannon-es'` 的类型文件统一改为：

```diff
- import type {Body} from 'cannon-es'
+ import type RAPIER from '@dimforge/rapier3d-compat'
```

然后将类型中的 `Body` 改为 `RAPIER.RigidBody`：

```diff
  interface CommonBoxEntity {
-     body: Body
+     body: RAPIER.RigidBody
+     colliderHandle: number
  }

  interface BaseTerrainEntity {
-     body: Body
+     body: RAPIER.RigidBody
+     terrainCollider: number
  }
```

### 特例：`src/entity/destroyed/types/index.ts`

此文件使用 `import type {Vec3} from 'cannon-es'` 定义碎片 hull 顶点类型：

```diff
- import type {Vec3} from 'cannon-es'
+ import type {RapVector3} from '../../../physics/rapier_utils.ts'

  interface FragmentData {
-     hullVerts: Vec3[]
+     hullVerts: RapVector3[]
      // ...
  }
```

### 特例：`src/character/combat/executor.ts`

```diff
- import type { Vec3 } from 'cannon-es'
+ import type { RapVector3 } from '../../../physics/rapier_utils.ts'
```

接口中的 `Vec3` 全部改为 `RapVector3`。

---

## 13b. 水物理 `forces.ts`

### 当前导入

```ts
import {Vec3, Quaternion, type Body, type AABB} from 'cannon-es'
```

### 改动

```diff
- import {Vec3, Quaternion, type Body, type AABB} from 'cannon-es'
+ import type RAPIER from '@dimforge/rapier3d-compat'
+ import {v3Set, v3Sub, v3Length, v3Scale, v3Add, v3Clone, v3Normalize,
+         type RapVector3, type RapQuaternion} from '../../../../physics/rapier_utils.ts'
```

文件内使用 `Vec3` 做数学运算的地方改为纯对象 + 工具函数：

```ts
// 旧
const _tmp = new Vec3()
_tmp.set(...)

// 新
const _tmp: RapVector3 = { x: 0, y: 0, z: 0 }
v3Set(_tmp, ...)
```

AABB 访问改为 Rapier body 的 `computeAabb()` 返回值。

`Body` 类型 → `RAPIER.RigidBody`。

---

## 13c. Voronoi 断裂 `voronoi_fracture.ts`

### 当前导入

```ts
import {Vec3} from 'cannon-es'
```

### 改动

```diff
- import {Vec3} from 'cannon-es'
+ import {v3, v3Set, v3Sub, v3Length, v3Normalize, v3Scale, v3Add,
+         type RapVector3} from '../../../physics/rapier_utils.ts'
```

此文件使用 `Vec3` 做**纯几何运算**（平面-线段交点计算、三角剖分、凸包计算），不涉及物理 API。替换模式统一：

```ts
// 旧
const a = new Vec3(x, y, z)
const d = a.length()
const n = new Vec3(a.x, a.y, a.z)
n.scale(1 / d, n)

// 新
import {v3, v3Length, v3Scale, v3Clone} from '...'
const a = v3(x, y, z)
const d = v3Length(a)
const n = v3Clone(a)
v3Scale(n, n, 1 / d)
```

**函数签名变更**：返回类型 `Vec3[]` → `RapVector3[]`，参数类型 `Vec3` → `RapVector3`。

---

## 13d. AI 状态文件 — 统一改动模式（8 个文件）

所有 AI 状态文件使用 `import {Vec3} from 'cannon-es'` 做方向计算和距离测量。统一改为：

```diff
- import {Vec3} from 'cannon-es'
+ import {v3Set, v3Sub, v3Length, v3Dist, v3Normalize, v3Scale, type RapVector3} from '../../../../physics/rapier_utils.ts'
```

常见改写模式：

```ts
// patrol.ts / build.ts / approach.ts 等 —— 读目标位置 + 计算方向距离
// 旧：
const targetPos = target.body.position
const dx = pos.x - targetPos.x
const dist = Math.sqrt(dx * dx + dz * dz)

// 新：
const targetPos = target.body.translation()
const dist = v3Dist(pos, targetPos)

// flee.ts / kite.ts —— 远离方向计算
// 旧：
const dir = new Vec3(selfPos.x - threatPos.x, 0, selfPos.z - threatPos.z)
const mag = dir.length()

// 新：
const dir: RapVector3 = { x: selfPos.x - threatPos.x, y: 0, z: selfPos.z - threatPos.z }
const mag = v3Length(dir)
```

**注意**：AI 状态文件中对 `entity.body.position` 的读取改为 `entity.body.translation()`，对 `entity.body.velocity` 的写入改为 `entity.body.setLinvel()`（如果存在速度写入的话）。

---

## 验证

所有类型文件通过 `pnpm tsc` 类型检查。
