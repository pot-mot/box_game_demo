# 04 — 角色刚体创建与同步

## 涉及文件

| 操作 | 文件 |
|------|------|
| 重写 | `src/entity/character/physics/world.ts`（body 创建 + syncPositions 部分） |

## 前置依赖

- [x] 01_rapier_utils.md
- [x] 02_physics_core.md

## 说明

本步骤只处理角色的 **body 创建** 和 **syncPositions**。地面检测、角色分离、状态机驱动的 velocity 写入在第 06/07 步处理。

---

## 改动详情

### 1. 导入替换

```diff
- import {Body, Box, Vec3, BODY_TYPES} from 'cannon-es'
+ import RAPIER from '@dimforge/rapier3d-compat'
+ import {v3, v3Set, v3Length} from '../../../physics/rapier_utils.ts'
```

### 2. Body 创建

**旧：**
```ts
const body = new Body({
    mass: 1,
    type: BODY_TYPES.DYNAMIC,
    fixedRotation: true,
    linearDamping: CHARACTER_LINEAR_DAMPING,
    shape: new Box(new Vec3(bw / 2, bh / 2, bd / 2)),
    collisionFilterGroup: DEFAULT_COLLISION_GROUP,
    collisionFilterMask: DEFAULT_COLLISION_MASK,
    material: shared.charMat,
})
shared.world.addBody(body)
```

**新：**
```ts
const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .lockRotations()                         // 等效 fixedRotation: true
    .setLinearDamping(CHARACTER_LINEAR_DAMPING)

const body = shared.world.createRigidBody(bodyDesc)

const colliderDesc = RAPIER.ColliderDesc.cuboid(bw / 2, bh / 2, bd / 2)
    .setFriction(0)                           // charMat 的 friction 为 0
    .setDensity(1.0)                          // 通过密度 + 体积控制质量
    .setCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK)
const charCollider = shared.world.createCollider(colliderDesc, body)
```

**注意事项：**
- Rapier 不能直接设 `mass = 1`，需通过 `setDensity()` + 体积自动计算。或使用 `setAdditionalMass()` 补足到期望质量
- `lockRotations()` 等价 cannon-es 的 `fixedRotation: true`
- 角色摩擦力为 0（`setFriction(0)`），保持 velocity-driven 不受接触摩擦干扰

### 3. syncPositions

**旧：**
```ts
entity.mesh.position.set(
    entity.body.position.x,
    entity.body.position.y,
    entity.body.position.z,
)
entity.mesh.quaternion.identity()
entity.appearanceGroup.position.set(
    entity.body.position.x,
    entity.body.position.y,
    entity.body.position.z,
)
```

**新：**
```ts
const pos = entity.body.translation()
entity.mesh.position.set(pos.x, pos.y, pos.z)
entity.mesh.quaternion.identity()             // 角色永远不旋转物理体
entity.appearanceGroup.position.set(pos.x, pos.y, pos.z)
```

### 4. Entity 类型改动

```diff
  interface CharacterEntity {
-     body: Body
+     body: RAPIER.RigidBody
+     colliderHandle: number
      mesh: Mesh
      appearanceGroup: Group
      // ...
  }
```

### 5. body 状态读取模式

所有 `entity.body.position.x` / `entity.body.velocity.x` 等访问改为：

```ts
// 读取
const pos = entity.body.translation()
const vel = entity.body.linvel()

// 写入
entity.body.setLinvel({ x: vx, y: vy, z: vz }, true)  // 第二个参数 wakeUp
entity.body.setTranslation({ x, y, z }, true)
```

---

## 验证

未完成状态机适配前，角色会静止在出生点（body 创建成功，但无 velocity 驱动）。
`pnpm dev` 应无类型错误。
