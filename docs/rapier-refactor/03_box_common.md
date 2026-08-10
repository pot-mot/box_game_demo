# 03 — 普通箱子实体适配

## 涉及文件

| 操作 | 文件 |
|------|------|
| 重写 | `src/entity/box/common/physics/world.ts` |

## 前置依赖

- [x] 01_rapier_utils.md
- [x] 02_physics_core.md

## 目标

将最简单的实体系统（普通箱子）先跑通，验证 body 创建 + syncPositions 模式在 Rapier 下可行。

---

## 改动详情

### 1. 导入替换

```diff
- import {Body, Box, Vec3, Quaternion, BODY_TYPES} from 'cannon-es'
+ import RAPIER from '@dimforge/rapier3d-compat'
+ import {v3Set} from '../../../../physics/rapier_utils.ts'
```

### 2. Body 创建（`addBox` 内部）

**旧：**
```ts
const body = new Body({
    mass: config.mass,
    type: config.mass === 0 ? BODY_TYPES.STATIC : BODY_TYPES.DYNAMIC,
    shape: new Box(new Vec3(hw, hh, hd)),
    position: new Vec3(x, y, z),
    collisionFilterGroup: DEFAULT_COLLISION_GROUP,
    collisionFilterMask: DEFAULT_COLLISION_MASK,
    material: shared.boxMat,
})
shared.world.addBody(body)
```

**新：**
```ts
import {DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../../physics/constants.ts'

const isStatic = config.mass === 0
const bodyDesc = isStatic
    ? RAPIER.RigidBodyDesc.fixed()
    : RAPIER.RigidBodyDesc.dynamic()
bodyDesc.setTranslation(x, y, z)

const body = shared.world.createRigidBody(bodyDesc)

const colliderDesc = RAPIER.ColliderDesc.cuboid(hw, hh, hd)
    .setFriction(0.5)
    .setCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK)
shared.world.createCollider(colliderDesc, body)
```

### 3. syncPositions

**旧：**
```ts
pb.mesh.position.set(
    pb.body.position.x,
    pb.body.position.y,
    pb.body.position.z,
)
pb.mesh.quaternion.set(
    pb.body.quaternion.x,
    pb.body.quaternion.y,
    pb.body.quaternion.z,
    pb.body.quaternion.w,
)
```

**新：**
```ts
const pos = pb.body.translation()
pb.mesh.position.set(pos.x, pos.y, pos.z)
const rot = pb.body.rotation()
pb.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
```

### 4. 配置变更（`updateConfig`）—— 盒子尺寸改变时重建形状

**旧：**
```ts
body.removeShape(body.shapes[0])
body.addShape(new Box(new Vec3(hw, hh, hd)))
body.updateMassProperties()
```

**新：**
```ts
// 删除旧 Collider（第二个参数 true = 立即唤醒相关 body）
shared.world.removeCollider(oldCollider, true)
// 创建新 Collider
const colliderDesc = RAPIER.ColliderDesc.cuboid(hw, hh, hd)
    .setFriction(0.5)
    .setCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK)
oldCollider = shared.world.createCollider(colliderDesc, body)
// 质量自动重算（从密度 + 体积）
```

需要**额外存储 `colliderHandle: number`** 在每个 entity 上，用于后续删除 / 重建。

### 5. 质量切换（mass 0 ↔ mass > 0）

Rapier **不支持运行时切换刚体类型**。质量切换需要：
1. 记录当前 body 的 `translation()` + `rotation()` + `linvel()` + `angvel()`
2. 删除旧 body + collider
3. 创建新的（类型正确的）body + collider
4. 恢复位置和速度

### 6. Entity 类型改动

```diff
  interface CommonBoxEntity {
      id: number
-     body: Body
+     body: RAPIER.RigidBody
+     colliderHandle: number
      mesh: Mesh
      config: BoxConfig
      // ...
  }
```

---

## 验证

完成后 `pnpm dev` —— 编辑模式下能创建、移动、删除箱子。箱子受重力掉落在地面上。这是迁移的首个可见成果。
