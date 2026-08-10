# 09 — 碎片 + 地形（Trimesh 方案）

## 涉及文件

| 操作 | 文件 |
|------|------|
| 重写 | `src/entity/fragment/common/physics/world.ts` |
| 重写 | `src/entity/terrain/base/physics/index.ts` |

## 前置依赖

- [x] 02_physics_core.md
- [x] 05_main_loop.md

---

## 9a. 碎片 (`fragment/common`)

### 凸包创建

**旧：**
```ts
import {ConvexPolyhedron} from 'cannon-es'

body.addShape(new ConvexPolyhedron({
    vertices: hullVerts.map(v => new Vec3(v.x, v.y, v.z)),
    faces: hullFaces,
}))
```

**新：**
```ts
// Rapier convexHull 只接受平铺顶点数组（每 3 个 float 一个顶点）
// 从 Voronoi 断裂数据中提取顶点
const flatVerts = new Float32Array(hullVerts.length * 3)
for (let i = 0; i < hullVerts.length; i++) {
    flatVerts[i * 3] = hullVerts[i].x
    flatVerts[i * 3 + 1] = hullVerts[i].y
    flatVerts[i * 3 + 2] = hullVerts[i].z
}

const colliderDesc = RAPIER.ColliderDesc.convexHull(flatVerts)
    .setFriction(0.5)
    .setCollisionGroups(FRAGMENT_COLLISION_GROUP, FRAGMENT_COLLISION_MASK)
shared.world.createCollider(colliderDesc, body)
```

### 注意

- Rapier `convexHull` 不接受 faces 索引，会自动计算凸包。如果断裂数据中的顶点已经形成凸包则没问题。
- 如果断裂产生的碎片是**凹多面体**，需改用 `convexDecomposition` 或 `trimesh`。Voronoi 断裂产生的是凸包碎片，所以 `convexHull` 适用。

### 冲量施加

```ts
// 旧
body.applyImpulse(new Vec3(ix, iy, iz), new Vec3(cx, cy, cz))

// 新
body.applyImpulseAtPoint({ x: ix, y: iy, z: iz }, { x: cx, y: cy, z: cz }, true)
```

### 碎片生命周期

```ts
// 旧：world.removeBody(body)
// 新：
shared.world.removeRigidBody(body)
// Collider 随 body 自动移除
```

### syncPositions

同普通箱子模式，`body.translation()` → `mesh.position.set()`, `body.rotation()` → `mesh.quaternion.set()`。

---

## 9b. 地形 Trimesh (`terrain/base`)

### 背景

Rapier Heightfield 不支持旋转。项目地形需要支持 `quat` 旋转参数 → **改用 Trimesh**。

### 高度数组 → 三角网格转换

```ts
/**
 * 将高度数组转换为三角网格顶点和索引
 * 供 Rapier ColliderDesc.trimesh() 使用
 */
const buildTrimeshFromHeights = (
    heights: number[][],
    gridSize: number,
    cellSize: number,
): { vertices: Float32Array; indices: Uint32Array } => {
    const n = gridSize
    const count = n * n
    const vertices = new Float32Array(count * 3)
    const indices: number[] = []

    // 顶点：以 body 为中心
    const half = ((n - 1) * cellSize) / 2
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const idx = (r * n + c) * 3
            vertices[idx] = c * cellSize - half      // x
            vertices[idx + 1] = heights[r][c]          // y
            vertices[idx + 2] = r * cellSize - half    // z
        }
    }

    // 索引：每个单元格 2 个三角形
    for (let r = 0; r < n - 1; r++) {
        for (let c = 0; c < n - 1; c++) {
            const a = r * n + c
            const b = a + 1
            const c_idx = a + n
            const d = c_idx + 1
            // triangle 1
            indices.push(a, b, d)
            // triangle 2
            indices.push(a, d, c_idx)
        }
    }

    return {
        vertices,
        indices: new Uint32Array(indices),
    }
}
```

### 创建地形 body

```ts
// 旧（cannon-es Heightfield）
const reverseZ = (heights: number[][]): number[][] => heights.map(col => [...col].reverse())
const baseQuat = new Quaternion().setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2)
const bodyPos = computeBodyPos(x, z, half, meshQuat)

body.addShape(new Heightfield(reverseZ(heights), { elementSize: cs }))
body.position.set(bodyPos.x, bodyPos.y, bodyPos.z)
if (quat) {
    body.quaternion.copy(userQuat.mult(baseQuat))
} else {
    body.quaternion.copy(baseQuat)
}

// 新（Rapier Trimesh）
const { vertices, indices } = buildTrimeshFromHeights(heights, gs, cs)

const bodyDesc = RAPIER.RigidBodyDesc.fixed()
bodyDesc.setTranslation(x, 0, z)
const body = shared.world.createRigidBody(bodyDesc)

const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
    .setFriction(0.5)
    .setCollisionGroups(TERRAIN_COLLISION_GROUP, TERRAIN_COLLISION_MASK)

// 支持旋转！
if (quat) {
    body.setRotation(quat, true)  // ← Trimesh 支持旋转
}
shared.world.createCollider(colliderDesc, body)
```

### 删掉的补丁函数

- `reverseZ()` —— 删除
- `computeBodyPos()` —— 删除，Trimesh 以 body 为中心
- `baseQuat = -PI/2` —— 删除，Trimesh 方向由顶点数据决定

### 雕刻时重建形状

```ts
// 旧
while (t.body.shapes.length) t.body.removeShape(t.body.shapes[0])
t.body.addShape(new Heightfield(reverseZ(t.heights), { elementSize: cs }))

// 新
shared.world.removeCollider(t.terrainCollider, true)
const { vertices, indices } = buildTrimeshFromHeights(t.heights, gs, cs)
t.terrainCollider = shared.world.createCollider(
    RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.5),
    t.body,
)
```

### liftBoxesOnTerrain

```ts
// 旧
s.world.bodies.forEach(b => {
    if (b.type === BODY_TYPES.DYNAMIC) { ... b.position.y = terrainY + halfH; b.wakeUp() }
})

// 新
for (const body of physicsEnv.getAllBodies()) {
    if (body.bodyType() !== 2) continue  // 只处理 Dynamic
    const pos = body.translation()
    const lx = pos.x - t.mesh.position.x
    const lz = pos.z - t.mesh.position.z
    // ... 边界检查（同旧版）
    const terrainY = t.mesh.position.y + t.heights[xi][zi]
    const aabb = body.computeAabb()
    const halfH = (aabb.max.y - aabb.min.y) / 2
    if (pos.y - halfH < terrainY) {
        body.setTranslation({ x: pos.x, y: terrainY + halfH, z: pos.z }, true)
    }
}
```

### Entity 类型

```diff
  interface BaseTerrainEntity {
-     body: Body
+     body: RAPIER.RigidBody
+     terrainCollider: number  // collider handle
      heights: number[][]
      mesh: Mesh
      // ...
  }
```

---

## 验证

1. 碎片：破坏箱子后碎片飞溅，能与其他刚体碰撞
2. 地形：能创建、移动、雕刻地形；地形上的箱子正常碰撞
3. 地形旋转后箱子仍能正确站在表面上
