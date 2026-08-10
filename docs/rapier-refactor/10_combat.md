# 10 — 战斗系统

## 涉及文件

| 操作 | 文件 |
|------|------|
| 重写 | `src/entity/character/combat/ranged_executor.ts` |
| 中改 | `src/entity/character/combat/melee_executor.ts` |
| 小改 | `src/character/combat/explosion.ts` |
| 小改 | `src/character/combat/executor.ts` |

## 前置依赖

- [x] 01_rapier_utils.md
- [x] 02_physics_core.md
- [x] 04_character_physics.md
- [x] 05_main_loop.md

---

## 10a. 爆炸 (`explosion.ts`)

### 改动

```diff
- import {Vec3} from 'cannon-es'
+ import {v3Set, v3Length, v3Dist} from '../../physics/rapier_utils.ts'

  // 旧：临时向量
- const _dir = new Vec3()
- _dir.set(tPos.x - centerX, tPos.y - centerY, tPos.z - centerZ)
- const dist = _dir.length()

  // 新：纯对象 + 工具函数
+ const _dir = { x: 0, y: 0, z: 0 }
+ v3Set(_dir, tPos.x - centerX, tPos.y - centerY, tPos.z - centerZ)
+ const dist = v3Dist(tPos, { x: centerX, y: centerY, z: centerZ })

  // 冲量施加
- const impulse = new Vec3(impX, impY, impZ)
- target.body.applyImpulse(impulse, target.body.position)
- target.body.wakeUp()

+ const pos = target.body.translation()
+ target.body.applyImpulseAtPoint(
+     { x: impX, y: impY, z: impZ },
+     pos,
+     true,
+ )
  // wakeUp 已通过第三个参数 true 处理
```

---

## 10b. 近战执行器 (`melee_executor.ts`)

### 改动

```diff
- import {Vec3} from 'cannon-es'
+ import {v3Set, v3Length, v3Scale, v3Normalize, v3Clone} from '../../../physics/rapier_utils.ts'

  // 旧：创建临时向量
- const _tmpVec = new Vec3()

  // 新：重用纯对象
+ const _tmpVec = { x: 0, y: 0, z: 0 }

  // AABB 检测中读目标位置
- target.body.position.x
- target.body.position.y
- target.body.position.z
+ const tPos = target.body.translation()
+ tPos.x

  // 方向计算
- _tmpVec.set(tx - wx, 0, tz - wz)
+ v3Set(_tmpVec, tx - wx, 0, tz - wz)

  // 距离
- _tmpVec.length()
+ v3Length(_tmpVec)

  // 归一化
- _tmpVec.scale(1 / len, _tmpVec)  // cannon-es Vec3.scale 修改自身
+ v3Scale(_tmpVec, _tmpVec, 1 / len)  // 或 v3Normalize

  // 构造冲量（旧：new Vec3）
- const imp = new Vec3(dir.x * force, forceY, dir.z * force)
+ const imp = { x: dir.x * force, y: forceY, z: dir.z * force }

  // 施加
- target.body.applyImpulse(imp, target.body.position)
- target.body.wakeUp()
+ const tPos2 = target.body.translation()
+ target.body.applyImpulseAtPoint(
+     { x: dir.x * force, y: forceY, z: dir.z * force },
+     tPos2,
+     true,
+ )
  // wakeUp 内联
```

---

## 10c. 远程执行器 (`ranged_executor.ts`) — 重写

### 子弹 Body 创建

**旧：**
```ts
import {Body, Sphere, Vec3, BODY_TYPES} from 'cannon-es'

const body = new Body({
    mass: 0.01,
    type: BODY_TYPES.DYNAMIC,
    linearDamping: 0,
    angularDamping: 1,
})
body.addShape(new Sphere(BULLET_SIZE))
body.position.set(spawnX, spawnY, spawnZ)
body.velocity.set(dirX, dirY, dirZ)
world.addBody(body)
```

**新：**
```ts
import RAPIER from '@dimforge/rapier3d-compat'

const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(spawnX, spawnY, spawnZ)
    .setLinearDamping(0)
bodyDesc.setAdditionalMass(0.01)  // 球体体积小，需额外设质量
const body = shared.world.createRigidBody(bodyDesc)

const colliderDesc = RAPIER.ColliderDesc.ball(BULLET_SIZE)
    .setRestitution(0)
shared.world.createCollider(colliderDesc, body)

// 设置初速度
body.setLinvel({ x: dirX, y: dirY, z: dirZ }, true)
```

### 子弹制导（homing）

**旧：**
```ts
bullet.body.velocity.x += steerX
bullet.body.velocity.z += steerZ
```

**新：**
```ts
const vel = bullet.body.linvel()
bullet.body.setLinvel({
    x: vel.x + steerX,
    y: vel.y,
    z: vel.z + steerZ,
}, true)
```

### 命中检测

**旧：**
```ts
const targetPos = target.body.position
const dx = bulletPos.x - targetPos.x
const dy = bulletPos.y - targetPos.y
const dz = bulletPos.z - targetPos.z
```

**新：**
```ts
const targetPos = target.body.translation()
const dx = bulletPos.x - targetPos.x
// ...
```

### 冲量施加（命中时）

同爆炸 / 近战模式：`applyImpulseAtPoint(imp, pos, true)`

### 子弹移除

**旧：**
```ts
world.removeBody(bullet.body)
```

**新：**
```ts
shared.world.removeRigidBody(bullet.body)
```

### 子弹 sync

**旧：**
```ts
bullet.mesh.position.set(bullet.body.position.x, ...)
```

**新：**
```ts
const pos = bullet.body.translation()
bullet.mesh.position.set(pos.x, pos.y, pos.z)
```

---

## 10d. 执行器接口 (`executor.ts`)

### 改动

```diff
- import type {Vec3} from 'cannon-es'
+ import type {RapVector3} from '../../../physics/rapier_utils.ts'

  interface SkillExecutor {
      start(ctx: ExecutorContext, entity: CharacterEntity, keyState: InputState): SkillState
      // ...
  }

  // ExecutorContext.direction: Vec3 → RapVector3
```

---

## 验证

1. 近战攻击 → AABB 碰撞检测命中、击退有效
2. 远程攻击 → 弹丸发射、飞行、制导、命中击退
3. 爆炸技能 → 范围内刚体受径向冲量
