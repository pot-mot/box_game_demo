# 07 — 地面检测 + 角色分离

## 涉及文件

| 操作 | 文件 |
|------|------|
| 重写 | `src/entity/character/physics/ground_state.ts` |
| 重写 | `src/entity/character/physics/separation.ts` |

## 前置依赖

- [x] 04_character_physics.md
- [x] 05_main_loop.md
- [x] 06_state_machine.md

## 说明

这是整个迁移中**最复杂的部分**。cannon-es 的 `world.contacts` 是直接可遍历的数组，Rapier 需要用事件队列 + 接触对查询来替代。

---

## 7a. `src/entity/character/physics/ground_state.ts` — 重写

### 当前实现逻辑

1. 遍历 `world.contacts`，筛选出涉及角色 body 的接触
2. 收集接触法线（`contact.ni`），过滤掉向下法线（`ny ≤ 0`）
3. **方向聚类投票**：将法线按 dot product > 0.9 分组，选取成员最多的簇的平均法线
4. 实现 **coyote time**：离地后 0.3s 内仍认为在地面上
5. 返回 `isOnGround`、`groundNormal`

### Rapier 实现

Rapier 中获取接触法线需要通过 `world.contactPair()` 逐个查询。

```ts
import RAPIER from '@dimforge/rapier3d-compat'
import {CONTACT_GROUND_KEEP_TIME} from './constants.ts'
import type {CharacterEntity} from './types.ts'

/** 地面检测结果 */
export interface GroundInfo {
    isOnGround: boolean
    groundNormal: { x: number; y: number; z: number }
}

/** 地面检测状态（持久化在 entity 上） */
export interface GroundState {
    contactNormals: Array<{ x: number; y: number; z: number }>
    groundKeepTimer: number
    prevNormal: { x: number; y: number; z: number }
}

/** 创建初始地面状态 */
export const createGroundState = (): GroundState => ({
    contactNormals: [],
    groundKeepTimer: 0,
    prevNormal: { x: 0, y: 1, z: 0 },
})

/** 每帧调用：从事件队列和接触对中提取地面信息 */
export const resolveGroundState = (
    world: RAPIER.World,
    eventQueue: RAPIER.EventQueue,
    entity: CharacterEntity,
    state: GroundState,
    dt: number,
): GroundInfo => {
    const charCollider = entity.colliderHandle
    state.contactNormals.length = 0

    // 步骤 1：用 CollisionEvent 获取与角色碰撞的所有 collider（快速过滤）
    const collidedColliders = new Set<number>()
    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        // Rapier collision events 报告 collider handles
        if (handle1 === charCollider) collidedColliders.add(handle2)
        if (handle2 === charCollider) collidedColliders.add(handle1)
    })

    // 步骤 2：对每个碰撞对查询接触法线
    for (const otherCollider of collidedColliders) {
        const contactPair = world.contactPair(charCollider, otherCollider)
        if (contactPair === null) continue
        // contactPair 可能为 null 如果这两个 collider 当前无接触
        // 读取 manifolds
        const numManifolds = contactPair.numContactManifolds()
        for (let m = 0; m < numManifolds; m++) {
            const manifold = contactPair.contactManifold(m)
            const normal = manifold.normal()
            // 只收集向上（ny > 0）的法线
            if (normal.y > 0) {
                state.contactNormals.push({ x: normal.x, y: normal.y, z: normal.z })
            }
        }
    }

    // 步骤 3：方向聚类投票（从 cannon-es 版本移植，逻辑不变）
    if (state.contactNormals.length > 0) {
        const clustered = clusterNormals(state.contactNormals)
        state.prevNormal = clustered
        state.groundKeepTimer = CONTACT_GROUND_KEEP_TIME
        return {
            isOnGround: true,
            groundNormal: clustered,
        }
    }

    // 步骤 4：coyote time
    state.groundKeepTimer -= dt
    if (state.groundKeepTimer > 0) {
        return {
            isOnGround: true,
            groundNormal: state.prevNormal,
        }
    }

    return {
        isOnGround: false,
        groundNormal: { x: 0, y: 1, z: 0 },
    }
}

/** 方向聚类投票 —— 与 cannon-es 版本相同 */
function clusterNormals(normals: Array<{ x: number; y: number; z: number }>): { x: number; y: number; z: number } {
    if (normals.length <= 1) return normals[0] ?? { x: 0, y: 1, z: 0 }

    // 按 dot product > 0.9 分组
    const clusters: Array<Array<typeof normals[0]>> = []
    const used = new Set<number>()

    for (let i = 0; i < normals.length; i++) {
        if (used.has(i)) continue
        const cluster: typeof normals = [normals[i]]
        used.add(i)
        for (let j = i + 1; j < normals.length; j++) {
            if (used.has(j)) continue
            const dot = normals[i].x * normals[j].x + normals[i].y * normals[j].y + normals[i].z * normals[j].z
            if (dot > 0.9) {
                cluster.push(normals[j])
                used.add(j)
            }
        }
        clusters.push(cluster)
    }

    // 选最大的簇
    let best = clusters[0]
    for (const c of clusters) {
        if (c.length > best.length) best = c
    }

    // 平均法线
    const result = { x: 0, y: 0, z: 0 }
    for (const n of best) {
        result.x += n.x
        result.y += n.y
        result.z += n.z
    }
    const len = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2)
    if (len > 0) {
        result.x /= len; result.y /= len; result.z /= len
    }
    return result
}
```

### 调用方改动

`src/entity/character/physics/world.ts` 的 `update()` 中：

```diff
- const contacts = shared.world.contacts
- const info = checkGround(contacts, entity, state)
+ const info = resolveGroundState(shared.world, shared.eventQueue, entity, state, dt)
```

---

## 7b. `src/entity/character/physics/separation.ts` — 重写

### 当前实现逻辑

1. 遍历 `world.contacts`，找涉及两个角色的接触对
2. 计算 2D 平面重叠距离和方向
3. 每个角色移动 `halfOverlap`
4. 施加反向速度（`sepSpeed * 0.5`）

### Rapier 实现

用 eventQueue 的碰撞事件获取角色间碰撞对，然后通过 body 的 AABB / position 手动计算分离。

```ts
import RAPIER from '@dimforge/rapier3d-compat'
import {v3Sub, v3Length, v3Scale, v3Normalize} from '../../../../physics/rapier_utils.ts'

const SEPARATION_SPEED = 0.5

export const computeSeparation = (
    world: RAPIER.World,
    eventQueue: RAPIER.EventQueue,
    entities: CharacterEntity[],
): void => {
    const entityMap = new Map<number, CharacterEntity>()
    for (const e of entities) {
        entityMap.set(e.colliderHandle, e)
    }

    // 收集角色间的碰撞对
    const charPairs: Array<[CharacterEntity, CharacterEntity]> = []

    eventQueue.drainCollisionEvents((h1, h2) => {
        const a = entityMap.get(h1)
        const b = entityMap.get(h2)
        if (a !== undefined && b !== undefined && a !== b) {
            charPairs.push([a, b])
        }
    })

    const _dir = { x: 0, y: 0, z: 0 }

    for (const [a, b] of charPairs) {
        const posA = a.body.translation()
        const posB = b.body.translation()

        // 水平分离向量
        v3Sub(_dir, posA, posB)
        _dir.y = 0
        const dist = v3Length(_dir)
        if (dist < 0.001) continue

        const radiusA = 0.25  // character half-width
        const radiusB = 0.25
        const overlap = radiusA + radiusB - dist
        if (overlap <= 0) continue

        // 归一化方向
        v3Normalize(_dir, _dir)
        const half = overlap / 2

        // 推离
        a.body.setTranslation({
            x: posA.x + _dir.x * half,
            y: posA.y,
            z: posA.z + _dir.z * half,
        }, true)

        b.body.setTranslation({
            x: posB.x - _dir.x * half,
            y: posB.y,
            z: posB.z - _dir.z * half,
        }, true)

        // 反向速度踢
        const velA = a.body.linvel()
        const velB = b.body.linvel()
        a.body.setLinvel({
            x: velA.x + _dir.x * SEPARATION_SPEED * 0.5,
            y: velA.y,
            z: velA.z + _dir.z * SEPARATION_SPEED * 0.5,
        }, true)
        b.body.setLinvel({
            x: velB.x - _dir.x * SEPARATION_SPEED * 0.5,
            y: velB.y,
            z: velB.z - _dir.z * SEPARATION_SPEED * 0.5,
        }, true)
    }
}
```

### 关键限制

Rapier 的 `eventQueue.drainCollisionEvents` 只在碰撞**开始或结束**时触发，不是每帧持续报告。对于已重叠的角色，**初始碰撞事件**可能已经在之前帧被排空。因此此实现可能**不覆盖持续重叠**的情况。

**改进方案**：结合 Rapier 的 `world.contactPairs()` 遍历（需要启用 `activeEvents` 或使用 `Automatic` 事件队列模式）。或者维护一个角色 collider 列表，每帧手动检测重叠。

---

## Entity 类型补充

```diff
  interface CharacterEntity {
      body: RAPIER.RigidBody
+     colliderHandle: number
      groundState: GroundState   // 新增持久化的地面状态
      // ...
  }
```

---

## 验证

- 角色站在地面上时不抖动
- 在斜坡上不滑落（反重力生效）
- 靠近悬崖边时 coyote time 允许起跳
- 两个角色靠近时互相排斥

---

## 最终实现（2026-08 修复后）

文档初版建议各系统直接 drain 共享队列，实践后改为事件总线架构，要点：

- `main.ts` 每个子步后立即 `eventBus.drain()`（见 05_main_loop.md），杜绝 autoDrain 丢事件与系统间争抢。
- `ContactTracker`（`src/physics/contact_tracking.ts`）订阅总线维护活跃接触对（started 加入 / stopped 移除），
  角色地面检测 / AI 推挤阻断 / 角色间分离共用同一份集合。
- 地面接触查询 `queryColliderContacts`：对每个活跃接触对调用 `collider.contactCollider(other, 0.1)`，
  取 `normal1`（指向查询碰撞体外侧 = 从角色指向对方），配合 `resolveGroundState` 的 flip 语义
  还原 cannon-es `contact.ni`（bi → bj）行为。
- 角色碰撞体启用 `ActiveEvents.COLLISION_EVENTS` 保证「角色↔任意物体」的接触事件必然产生。
- 分离逻辑仍在 character `update()` 中按帧执行（镜像 master 的 world.contacts 遍历）。

已知物理伪影：Rapier Trimesh 对轴对齐盒存在棱-棱伪造法线，60° 以上陡坡会出现单帧法线突变
（表现为速度尖峰/亚毫米振动），多数投票未能完全抑制，后续可在投票层加历史一致性过滤。

### 角色跳跃落地修复

Rapier 接触结算后静止 vy≈0，`jumping → falling` 的 `|vy| >= 0.05` 守卫不再必然命中。
`jumping.ts` 增加落地守卫（`stateTime >= JUMP_LAND_MIN_TIME && vy <= 0 && isSupportedOn`），
分别转入 `walking`（有输入）与 `idle`（无输入）。

### 测试

- 完整地面检测 / 斜坡 / 挤压弹射测试已从 master 恢复（`slope.test.ts`、`slope_walk_matrix.test.ts`、
  `squeeze_eject.test.ts`），测试 harness 位于 `src/entity/character/physics/harness.ts`。
