# 08 — 复杂箱子实体：弹性 / 燃烧 / 破坏 / 磁力 / 水

## 涉及文件

| 操作 | 文件 |
|------|------|
| 重写 | `src/entity/box/elasticity/physics/world.ts` |
| 重写 | `src/entity/box/burning/physics/world.ts` |
| 重写 | `src/entity/box/destructed/physics/world.ts` |
| 重写 | `src/entity/box/magnet/physics/world.ts` |
| 中改 | `src/entity/area/water/physics/world.ts` |

## 前置依赖

- [x] 02_physics_core.md
- [x] 05_main_loop.md

---

## 8a. 弹性箱子 (`elasticity`)

### 碰撞事件重写

**旧：**
```ts
body.addEventListener('collide', (event) => {
    const contact = event.contact
    const otherBody = event.body
    // ... 记录碰撞方向和强度用于变形系统
})
```

**新：**
```ts
// 在 preSync(dt, time, eventQueue) 中
eventQueue.drainCollisionEvents((handle1, handle2, started) => {
    if (!started) return  // 只关心碰撞开始
    const h1 = world.getRigidBody(handle1)
    const h2 = world.getRigidBody(handle2)
    if (!h1 || !h2) return

    // 检查是否涉及弹性箱子
    const elasticBody = h1.handle === myHandle ? h1 : h2.handle === myHandle ? h2 : null
    if (!elasticBody) return
    const otherHandle = h1.handle === myHandle ? handle2 : handle1

    // 通过 world.contactPair() 获取接触法线（驱动变形方向）
    const pair = world.contactPair(myColliderHandle, otherHandle)
    if (pair === null || pair.numContactManifolds() === 0) return
    const manifold = pair.contactManifold(0)
    const normal = manifold.normal()

    // 后续变形系统逻辑不变，传入 normal 替代 event.contact.ni
})
```

### 变形的其他部分（弹簧-阻尼、体积守恒）不涉及 cannon-es API，无需改动。

### syncPositions：同 03_box_common

---

## 8b. 燃烧箱子 (`burning`)

### 质量衰减改写

**旧：**
```ts
body.mass = config.mass * (1 - burnProgress * 0.8)
body.updateMassProperties()
```

**Rapier 不支持运行时改质量。改为手动施力模拟质量减轻：**

```ts
const massDeficit = config.mass * burnProgress * 0.8
body.resetForces(true)
// 补偿重力：质量减轻 → 本该受到的向下力减少 → 施加上升力等效
body.addForce({ x: 0, y: -massDeficit * GRAVITY, z: 0 }, true)
```

### Body 创建和 syncPositions：同 03_box_common

---

## 8c. 破坏箱子 (`destructed`)

### 碰撞事件同 8a 弹性箱子

### 碎片冲量

**旧：**
```ts
fragmentBody.applyImpulse(
    new Vec3(impX, impY, impZ),
    fragmentBody.position,
)
```

**新：**
```ts
const fragBody = world.getRigidBody(fragHandle)
const pos = fragBody.translation()
fragBody.applyImpulseAtPoint(
    { x: impX, y: impY, z: impZ },
    pos,
    true,
)
```

### 移除 body

**旧：**
```ts
world.removeBody(body)
```

**新：**
```ts
world.removeRigidBody(body)
// Collider 随 body 自动删除
```

---

## 8d. 磁力箱子 (`magnet`)

### 力施加改写

**旧：**
```ts
target.applyForce(_force, tPos)
target.angularVelocity.set(0, 0, 0)
// clamp velocity
target.velocity.set(clampedVx, clampedVy, clampedVz)
target.wakeUp()
```

**新：**
```ts
body.addForceAtPoint(
    { x: forceX, y: forceY, z: forceZ },
    { x: tPosX, y: tPosY, z: tPosZ },
    true,
)
body.setAngvel({ x: 0, y: 0, z: 0 }, true)
const vel = body.linvel()
const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2)
if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed
    body.setLinvel({ x: vel.x * scale, y: vel.y * scale, z: vel.z * scale }, true)
}
```

### 刚体遍历

**旧：**
```ts
physicsEnv.getAllBodies().forEach(body => { ... })
// getBody === Body（cannon-es）
```

**新：**
```ts
for (const body of physicsEnv.getAllBodies()) {
    // body === RigidBody（Rapier）
    if (body.bodyType() !== 2 /* Dynamic */) continue  // 或 RigidBodyType.Dynamic
    const pos = body.translation()
    // ... 磁吸引力计算
}
```

### `physics/env.ts` 的 `getAllBodies()` 需要能返回 Rapier RigidBody 引用

参见 02_physics_core 中的 env 改动。

---

## 8e. 水 (`water`)

水物理不依赖碰撞检测（自定义 AABB-OBB 重叠 + 手动施力），改动较少：

### 力施加

**旧：**
```ts
target.body.applyForce(buoyancyForce, target.body.position)
target.body.angularVelocity.x *= angularDrag
target.body.angularVelocity.y *= angularDrag
target.body.angularVelocity.z *= angularDrag
```

**新：**
```ts
const body = target.body  // RAPIER.RigidBody
const pos = body.translation()
body.addForceAtPoint(
    { x: buoyX, y: buoyY, z: buoyZ },
    pos,
    true,
)
const angVel = body.angvel()
body.setAngvel({
    x: angVel.x * angularDrag,
    y: angVel.y * angularDrag,
    z: angVel.z * angularDrag,
}, true)
```

### 读取刚体属性

| 旧 | 新 |
|---|---|
| `body.position` | `body.translation()` |
| `body.mass` | `body.mass()` |
| `body.type` | `body.bodyType()` |

---

## 验证

1. 弹性箱子 → 碰撞后变形回弹
2. 燃烧箱子 → 逐渐损毁，质量减轻效果可见
3. 破坏箱子 → 受击碎裂为碎片
4. 磁力箱子 → 吸引周围箱子
5. 水 → 箱子在水中浮起、减速
