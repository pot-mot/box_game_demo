# 物理（physics/）模块约定

## 约定

- 共享物理世界统一用 `SharedWorld`（`world.ts`）；**独立持世界一律经 `fixed_step.ts` 的 `createFixedStepStepper` 步进**（清力已内聚在运行器内）。
- **场景查询（射线）统一走 `raycast.ts` 的 `createRapierRayCaster`**（`castOne`，基于 Rapier 查询管线 BVH）。禁止用 `THREE.Raycaster` 对渲染 mesh 做逐帧场景查询：大 trimesh（地形 / 建筑）会线性扫全部三角形，曾致 AI 视线 / 导航每帧数百万次求交而卡死。查询排除传感器碰撞体（投掷物 / 掉落物 / 水域），过滤用 `RayQueryFilter` 的类别掩码（`collision_category.ts` 的 `collisionCategoryMask`）+ 排除刚体 handle；命中结果含世界系法线、类别、刚体 handle 与世界 AABB 顶部 Y（trimesh / 凸多面体由顶点 AABB 缓存导出）。
- 新增碰撞体必须显式 `setCollisionGroups`，用 `collision_category.ts` 的 `categoryCollisionGroups(group, mask, category)` 标注类别（`ground` / `box` / `fragment` / `area` / `terrain` / `character` / `building` / `interactable` / `item` / `shield`）。
- **`'shield'` 类别**（位 `1 << 14`）：盾遮挡体为**无父刚体的 parentless sensor**，membership 仅含盾类别位、mask 0（不参与物理碰撞），仅供子弹形状扫描识别（`castShape` 的 `filterPredicate` 按类别匹配）；`isBlockingGeometry` 对 `'shield'` 返回 true（非 `character`），故未走盾判定时仍可兜底阻挡投掷物。同步 / 释放见 [`entity/character/physics/physics.md`](../entity/character/physics/physics.md)。
- magic number 提取到 `constants.ts`。

## 陷阱

- **Rapier `addForce` 不会在 `step` 后自动清除**，本项目所有施力为**每帧瞬态**语义：任何自建 `SharedWorld` 必须每个物理子步结束后 `clearAllForces`；**严禁**在子模块内手写 `world.step` / `eventBus.drain` 子步循环（曾因漏清力导致角色跳跃后持续升空）。
- 休眠 body 无视 velocity 写入：操作 velocity 前必须 `body.wakeUp()`；`setLinvel(vel, true)` 第二参数同样唤醒，本项目一律传 `true`。
- 角色 collider 是**竖直胶囊**（半径 = `CHARACTER_BASE_SIZE.width/2`，总高 = `height`），不是 cuboid：平底 cuboid 在 trimesh 地形上坡会被内部棱幽灵法线卡死。rapier3d-compat 0.19/0.20 的 `FIX_INTERNAL_EDGES` 已损坏、heightfield 在该版本 wasm 直接崩溃，**禁止使用**；地形一律用 `RAPIER.ColliderDesc.trimesh`。
- **地面接触法线必须经 `contact_tracking.ts` 的 `queryColliderContacts` 取，禁止直接用 `Collider.contactCollider`**：后者在角色同时接触地面与箱 / 交互物时会返回被污染的世界法线，且会返回形状并未真正接触的 speculative 接触。
- 未声明碰撞组的碰撞体 membership 全 1，会被解析为 `ground` 并挡下子弹（fail-closed）；类别位从 membership 第 5 位起，不参与交互。
