# 05 — 主循环与异步初始化

## 涉及文件

| 操作 | 文件 |
|------|------|
| 中改 | `src/main.ts` |

## 前置依赖

- [x] 02_physics_core.md
- [x] 03_box_common.md
- [x] 04_character_physics.md

---

## 改动详情

### 1. 新增导入

```diff
+ import RAPIER from '@dimforge/rapier3d-compat'
  import {createSharedWorld} from './physics/world.ts'
  import {createPhysicsEnv} from './physics/env.ts'
```

### 2. 异步初始化（在 `main()` 最顶部）

```diff
  async function main() {
+     // Rapier WASM 预加载
+     await RAPIER.init()
+
      const shared = createSharedWorld()
      const physicsEnv = createPhysicsEnv()
      // ...
```

### 3. 物理步进（`tick()` 中）

**旧（两种模式）：**
```ts
// 模式 A：正常仿真
shared.world.step(FIXED_TIME_STEP, delta, MAX_SUB_STEPS)

// 模式 B：单步执行
shared.world.step(FIXED_TIME_STEP, FIXED_TIME_STEP, 1)
```

**新：**
```ts
// 模式 A：正常仿真 —— 手动子步循环
const totalSteps = Math.min(
    Math.max(1, Math.ceil(delta / FIXED_TIME_STEP)),
    MAX_SUB_STEPS,
)
for (let i = 0; i < totalSteps; i++) {
    shared.world.step(shared.eventQueue)
    shared.eventBus.drain()   // ★ 每个子步立即排空并广播事件
}

// 模式 B：单步执行
shared.world.step(shared.eventQueue)
shared.eventBus.drain()
```

**关键差异：** Rapier 的 `world.step()` 不接受 `dt` 参数，总使用内固定步长（默认 ~1/60s）。手动子步循环模拟 cannon-es 的 `maxSubSteps` 行为。

**★ 必须在每个子步后立即 `eventBus.drain()`：** `EventQueue(autoDrain=true)` 在每次
`step` 前自动清空队列，若拖到循环结束再排空，只有最后一个子步的事件能存活，
落地等接触开始事件会随机丢失（地面检测时灵时不灵）。排空后事件广播给所有订阅者，
并触发 `onStepEnd` 钩子（速度快照刷新 + `clearAllForces` 清力）。

### 4. preSync 调用

```diff
   for (const system of systems) {
       system.preSync?.(dt, time)
   }
```

弹性箱子、可破坏箱子的**撞击检测**已移到事件总线订阅中即时处理（需要撞击前速度），
preSync 只保留按帧推进的逻辑（伤害结算/碎裂、弹簧积分）。

### 5. 所有 `FIXED_TIME_STEP` 引用保持不变

`constants.ts` 中的 `FIXED_TIME_STEP` 仍用于子步计数计算。

---

## 验证

`pnpm dev` —— 箱子能掉落；角色能站立；编辑模式轨道相机工作。
