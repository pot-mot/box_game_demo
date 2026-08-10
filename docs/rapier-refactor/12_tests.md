# 12 — 测试回归

## 涉及文件

约 18 个 `*.test.ts` 文件需要改动，其余无需改动。e2e 测试可能无需改动。

## 前置依赖

- [x] 所有上游改动（01-13）

---

## 需要改动的测试文件（完整清单）

| 测试文件 | cannon-es 用途 | 改动方式 |
|---------|---------------|---------|
| `character/combat/melee_skill.test.ts` | mock `body.position` / `body.velocity` | 改为 `{x,y,z}` 纯对象 |
| `character/combat/ranged_skill.test.ts` | 同上 | 同上 |
| `character/combat/explosion.test.ts` | `new Vec3(x,y,z)` 构造 mock | 改为 `{x,y,z}` |
| `character/state_machine/machine.test.ts` | `new Vec3(...)` mock entity body | 改为纯对象 mock |
| `character/state_machine/ground.test.ts` | `new Vec3(...)` 向量运算 | 改为 rapier_utils 工具函数 |
| `entity/character/physics/ground_state.test.ts` | mock `world.contacts` + `Body/Vec3` | 重写为 mock `eventQueue` + `contactPair()` |
| `entity/character/physics/slope.test.ts` | mock body + `Vec3` + `Heightfield` | 改为 Rapier body mock + rapier_utils |
| `entity/character/physics/slope_walk_matrix.test.ts` | `Body/Box/Vec3/Heightfield/Quaternion/Plane` 完整 mock | 重写为 Rapier 等价物 |
| `entity/character/physics/squeeze_eject.test.ts` | 同上 | 重写 |
| `entity/character/ai/ai.test.ts` | `Vec3` mock | 改为 `{x,y,z}` 纯对象 |
| `entity/character/ai/nav.test.ts` | `Vec3/World/Body/Box/Material/ContactMaterial/SAPBroadphase` 完整 world mock | 重写为 Rapier world mock |
| `entity/box/base/physics/index.test.ts` | body 创建 mock | 改为 Rapier body mock |
| `entity/box/base/health.test.ts` | 可能涉及 body | 按需检查 |
### 无需改动的测试

| 测试文件 | 原因 |
|---------|------|
| `entity/box/base/event_emitter.test.ts` | 纯事件系统，不涉及物理 |
| `save_load/validation.test.ts` | Zod schema 校验，不涉及 cannon-es API |
| `types/readonly.test.ts` | 纯类型测试 |
| `render/grid.test.ts` | Three.js 渲染，不涉及物理 |
| `character/faction.test.ts` | 纯逻辑 |
| `character/archetypes.test.ts` | 纯逻辑 |
| `character/weapon/melee_weapon.test.ts` | 纯逻辑 |
| `character/weapon/ranged_weapon.test.ts` | 纯逻辑 |

### Mock body 模式变更

所有测试中 mock 角色/箱子 entity 的 `body` 对象需要更新：

```ts
// 旧（cannon-es mock）
const mockBody = {
    position: new Vec3(0, 1, 0),
    velocity: new Vec3(0, 0, 0),
    force: new Vec3(0, 0, 0),
    mass: 1,
    wakeUp: vi.fn(),
    applyImpulse: vi.fn(),
}

// 新（Rapier mock）
const mockBody = {
    translation: () => ({ x: 0, y: 1, z: 0 }),
    linvel: () => ({ x: 0, y: 0, z: 0 }),
    setLinvel: vi.fn(),
    setTranslation: vi.fn(),
    addForce: vi.fn(),
    addForceAtPoint: vi.fn(),
    applyImpulseAtPoint: vi.fn(),
    resetForces: vi.fn(),
    mass: () => 1,
    wakeUp: vi.fn(),
    bodyType: () => 2,  // Dynamic
    computeAabb: () => ({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } }),
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
}
```

### 关键变化

| cannon-es API | Rapier mock 替换 |
|---|---|
| `body.position` (属性) | `body.translation()` (方法) |
| `body.velocity` (属性) | `body.linvel()` (方法) |
| `body.force` (属性) | `body.resetForces()` + `body.addForce()` |
| `body.applyImpulse(imp, pos)` | `body.applyImpulseAtPoint(imp, pos, true)` |
| `body.wakeUp()` | `body.wakeUp()` (同名) |
| `world.contacts` (数组) | mock `eventQueue` + `world.contactPair()` |
| `new Vec3(x, y, z)` | `{ x, y, z }` |

---

## 地面检测测试重写要点

`ground_state.test.ts` 目前 mock `world.contacts` 数组。需要重写为：

1. Mock `eventQueue.drainCollisionEvents()` —— 提供碰撞对
2. Mock `world.contactPair(c1, c2)` —— 返回 mock manifold 含法线
3. 验证 `resolveGroundState()` 对不同法线方向的响应（向上 → onGround，向下 → 忽略，多方向 → 聚类投票）
4. 验证 coyote time 行为

---

## E2E 测试

`e2e/smoke.spec.ts` 测试页面加载、启动画面、模式切换等 —— 不涉及物理 API，**可能无需改动**。但需要验证 Rapier WASM 加载不延迟首次渲染。

---

## 验证

```bash
pnpm tsc         # 类型检查通过
pnpm vitest run  # 全部单元测试通过
```
