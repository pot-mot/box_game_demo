# 11 — 存档系统

## 涉及文件

| 操作 | 文件 |
|------|------|
| 小改 | `src/save_load/serialize.ts` |
| 小改 | `src/save_load/deserialize.ts` |

## 前置依赖

- [x] 所有上游 entity 系统（03-10）

---

## 设计决策

两种方案可选：

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| A | 保持按 entity 独立保存 pos/quaternion | 改动最小，与现有存档结构兼容 | 无 |
| B | 改用 `world.takeSnapshot()` 全局快照 | 一行搞定所有物理状态 | 存档结构需重构，与 entity 自定义状态分离 |

**选择方案 A**：改动最小，风险最低。方案 B 可在后续迭代中引入。

---

## 11a. `src/save_load/serialize.ts`

此文件**没有直接导入 cannon-es**，仅通过 entity 对象的 `.body.position` / `.body.quaternion` 间接访问。

### 改动

仅需确保 `vec3ToTuple()` 和 `quatToTuple()` 接收 Rapier 返回的纯对象：

```ts
// 这些函数接收 {x, y, z} 或 {x, y, z, w}，cannon Vec3 和 Rapier 的 translation() 返回格式一致

export const vec3ToTuple = (v: { x: number; y: number; z: number }): [number, number, number] =>
    [v.x, v.y, v.z]

export const quatToTuple = (q: { x: number; y: number; z: number; w: number }): [number, number, number, number] =>
    [q.x, q.y, q.z, q.w]
```

### 调用处无需改动

```ts
// 旧：e.body.position（cannon-es Vec3 → {x, y, z} 兼容）
// 新：e.body.translation()（Rapier → {x, y, z}）
// 两者格式相同，vec3ToTuple 无需改动

position: vec3ToTuple(e.body.translation()),  // 唯一变化：.position → .translation()
quaternion: quatToTuple(e.body.rotation()),   // .quaternion → .rotation()
```

### 但注意：地形序列化的是 `mesh.position` / `mesh.quaternion`（Three.js），不是物理 body → **无需改动**

---

## 11b. `src/save_load/deserialize.ts`

### 当前导入

```ts
import {Vec3} from 'cannon-es'
```

### 用途

`new Vec3(x, y, z)` 仅用于在 `jsonToFragmentData()` 中重建碎片 hull 顶点（将 `[x, y, z]` JSON 数组转回 `Vec3` 对象传给断裂算法）。

### 改动

```diff
- import {Vec3} from 'cannon-es'
+ import {v3} from '../physics/rapier_utils.ts'

  // jsonToFragmentData() 中：
- hullVerts.push(new Vec3(x, y, z))
+ hullVerts.push(v3(x, y, z))
```

### 其他 deserialize 逻辑

`deserialize.ts` 将 JSON 中的 `[x, y, z]` / `[x, y, z, w]` 解构为纯对象后传给各 entity 的 `.add()` 方法：

```ts
const [x, y, z] = entity.position
const quat = { x: entity.quaternion[0], ... }
common.add(entity.config, x, y, z, quat)
```

这些值最终进入 entity 的 `bodyDesc.setTranslation(x, y, z)` 和 `body.setRotation(quat, ...)` —— 格式一致，**无需改动**。

---

## 11c. 存档类型

`src/save_load/types.ts` 中的 `Vec3JSON` 和 `QuatJSON` 类型不变：

```ts
type Vec3JSON = [number, number, number]
type QuatJSON = [number, number, number, number]
```

---

## 验证

1. 编辑模式下保存存档 → 退出 → 重新加载 → 箱子位置、大小、类型一致
2. 游玩模式下角色位置恢复
3. 碎片 / 地形正确恢复
4. 弹性箱子变形状态（def/vel）正确保存和恢复
