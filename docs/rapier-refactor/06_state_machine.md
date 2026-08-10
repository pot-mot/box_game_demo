# 06 — 状态机 9 文件 + ground.ts

## 涉及文件

| 操作 | 文件 |
|------|------|
| 中改 | `src/character/state_machine/states/idle.ts` |
| 中改 | `src/character/state_machine/states/walking.ts` |
| 中改 | `src/character/state_machine/states/jumping.ts` |
| 中改 | `src/character/state_machine/states/falling.ts` |
| 中改 | `src/character/state_machine/states/attacking.ts` |
| 中改 | `src/character/state_machine/states/dashing.ts` |
| 中改 | `src/character/state_machine/states/flinching.ts` |
| 中改 | `src/character/state_machine/states/dying.ts` |
| 中改 | `src/character/state_machine/ground.ts` |
| 小改 | `src/character/types.ts` |

## 前置依赖

- [x] 04_character_physics.md
- [x] 05_main_loop.md

---

## 核心改写模式

所有 9 个状态文件遵循**同一个改写模式**。以 idle 为例：

### `src/character/state_machine/states/idle.ts`

**旧：**
```ts
import {Vec3} from 'cannon-es'

// 读取速度
const vx = entity.body.velocity.x
const vz = entity.body.velocity.z

// 写入速度
entity.body.velocity.set(vx * GROUND_DAMPING, entity.body.velocity.y, vz * GROUND_DAMPING)
entity.body.wakeUp()
```

**新：**
```ts
import {v3Set} from '../../../physics/rapier_utils.ts'

// 读取速度
const vel = entity.body.linvel()

// 写入速度
entity.body.setLinvel({
    x: vel.x * GROUND_DAMPING,
    y: vel.y,
    z: vel.z * GROUND_DAMPING,
}, true)  // 第二个参数 = wakeUp
// 无需单独调用 wakeUp()
```

### 统一改写表

以下模式在所有状态文件中替换：

| 旧 (cannon-es) | 新 (Rapier) |
|---|---|
| `entity.body.velocity.x` (读) | `entity.body.linvel().x` |
| `entity.body.velocity.set(vx, vy, vz)` | `entity.body.setLinvel({ x:vx, y:vy, z:vz }, true)` |
| `entity.body.position` (读) | `entity.body.translation()` |
| `entity.body.wakeUp()` | 合并到 `setLinvel()` 的第二个参数 |
| `entity.body.force.y = -mass * GRAVITY` | `entity.body.resetForces(true); entity.body.addForce({ x:0, y:-mass*GRAVITY, z:0 }, true)` |
| `new Vec3()` 临时 | `{ x:0, y:0, z:0 }` + `v3Set()` |

### `src/character/state_machine/ground.ts` 特殊改动

此文件中对 `entity.body` 的力/速度操作：

```ts
// 斜坡反重力：entity.body.force.y = -entity.body.mass * GRAVITY
// Rapier（注意：Rapier 中 body.mass() 是方法调用）：
const mass = entity.body.mass()
entity.body.resetForces(true)
entity.body.addForce({ x: 0, y: -mass * GRAVITY, z: 0 }, true)

// 斜坡下沉：entity.body.velocity.y = sinkSpeed
entity.body.setLinvel({ x: vel.x, y: sinkSpeed, z: vel.z }, true)
```

### `src/character/types.ts`

```diff
- import type {Body} from 'cannon-es'
+ import type RAPIER from '@dimforge/rapier3d-compat'

  interface CharacterEntity {
-     body: Body
+     body: RAPIER.RigidBody
      // ...
  }
```

---

## 各状态特有改动点

| 状态 | 特殊操作 | 改法 |
|------|---------|------|
| **jumping** | `vy = sqrt(2 * 9.82 * jumpHeight)`  | 使用 `setLinvel()` |
| **walking** | `vx = dx * speed; vz = dz * speed` | 同上 |
| **falling** | 空气控制 `AIR_CONTROL_FACTOR` + 速度限制 | 同上 + `linvel()` 读取当前速度 |
| **dashing** | 锁定方向，速度乘 `2`，0.25s 后褪除 | 同上 |
| **flinching** | 每帧 `velocity.set(0,0,0)` 硬直 | `setLinvel({x:0,y:0,z:0}, true)` |
| **dying** | 清零速度 + 标记移除 | 同上 |
| **attacking** | 多阶段 `moveSpeedMultiplier` 控制 | `setLinvel()` 写入 |
| **idle** | `GROUND_DAMPING` 衰减 | 同上 |

---

## 验证

`pnpm dev` —— 游玩模式下角色可走动、跳跃、下坠、冲刺、攻击。移动手感应与迁移前一致。
