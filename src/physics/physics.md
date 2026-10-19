# 物理（physics/）模块约定

## 约定

- 共享物理世界统一用 `SharedWorld`（`world.ts`）；**独立持世界一律经 `fixed_step.ts` 的 `createFixedStepStepper` 步进**（清力已内聚在运行器内）。
- **固定步时钟（`fixed_step.ts` 的 `createFixedStepClock`）**：物理固定 `1/60`，每渲染帧按真实 `delta` 累加决定步数（`0..MAX_SUB_STEPS`）；**不追赶**，达到上限仍未还清的时间作为欠账丢弃（时间膨胀），避免死亡螺旋。`main.ts` play 模式与展示模式必须使用同一时钟语义。
- **滞后一拍渲染插值（`render_interpolation.ts`）**：每个物理步末 `captureRenderState` 记录 `prev/curr` 变换，渲染帧 `syncPositions(alpha)` 写 `lerp(prev, curr, alpha)`。角色 / 箱子 / 碎片 / 掉落物 / 运动平台等动态实体统一插值；静态地形 / 建筑无需插值。单步位移超过 `SNAP_DISTANCE` 视为传送，直接吸附。
- **游戏时间轴跟随物理步**：play / 展示模式的状态机、战斗计时器、动画、弹丸、VFX 一律按 `FIXED_TIME_STEP` 推进，不再使用渲染 `delta`；编辑模式持续执行沿用原有变速步进语义。
- **场景查询（射线）统一走 `raycast.ts` 的 `createRapierRayCaster`**（`castOne`，基于 Rapier 查询管线 BVH）。禁止用 `THREE.Raycaster` 对渲染 mesh 做逐帧场景查询：大 trimesh（地形 / 建筑）会线性扫全部三角形，曾致 AI 视线 / 导航每帧数百万次求交而卡死。查询排除传感器碰撞体（投掷物 / 掉落物 / 水域），过滤用 `RayQueryFilter` 的类别掩码（`collision_category.ts` 的 `collisionCategoryMask`）+ 排除刚体 handle；命中结果含世界系法线、类别、刚体 handle 与世界 AABB 顶部 Y（trimesh / 凸多面体由顶点 AABB 缓存导出）。
- 新增碰撞体必须显式 `setCollisionGroups`，用 `collision_category.ts` 的 `categoryCollisionGroups(group, mask, category)` 标注类别（`ground` / `box` / `fragment` / `area` / `terrain` / `character` / `building` / `interactable` / `item` / `shield`）。
- **`'shield'` 类别**（位 `1 << 14`）：盾遮挡体为**无父刚体的 parentless sensor**，membership 仅含盾类别位、mask 0（不参与物理碰撞），仅供子弹形状扫描识别（`castShape` 的 `filterPredicate` 按类别匹配）；`isBlockingGeometry` 对 `'shield'` 返回 true（非 `character`），故未走盾判定时仍可兜底阻挡投掷物。同步 / 释放见 [`entity/character/physics/physics.md`](../entity/character/physics/physics.md)。
- magic number 提取到 `constants.ts`。

## 陷阱

- **Rapier `addForce` 不会在 `step` 后自动清除**，本项目所有施力为**每帧瞬态**语义：任何自建 `SharedWorld` 必须每个物理子步结束后 `clearAllForces`；**严禁**在子模块内手写 `world.step` / `eventBus.drain` 子步循环（曾因漏清力导致角色跳跃后持续升空）。固定步循环中 `preSync` 按每物理步执行，故施力是「每物理步」瞬态。
- **禁止按渲染帧频率推进游戏逻辑**：渲染帧只决定本帧执行几个物理步（累加器），状态机 / 计时器 / 动画必须在物理步内以 `FIXED_TIME_STEP` 推进；否则掉帧或高刷时会出现时间漂移与滑步。
- 休眠 body 无视 velocity 写入：操作 velocity 前必须 `body.wakeUp()`；`setLinvel(vel, true)` 第二参数同样唤醒，本项目一律传 `true`。
- 角色**主碰撞体是胶囊**（触地 / 分离主引用），不是平底 cuboid：平底 cuboid 在 trimesh 地形上坡会被内部棱幽灵法线卡死。碰撞体由各体形的 `BodyForm.colliderLayout` 声明（人形 = 上下半竖直胶囊；四足 / 飞龙 = 主竖直胶囊 + 横胶囊 / 悬空盒补形，横胶囊由节点 90° 旋转实现）。rapier3d-compat 0.19/0.20 的 `FIX_INTERNAL_EDGES` 已损坏、heightfield 在该版本 wasm 直接崩溃，**禁止使用**；地形一律用 `RAPIER.ColliderDesc.trimesh`。
- **地面接触法线必须经 `contact_tracking.ts` 的 `queryColliderContacts` 取，禁止直接用 `Collider.contactCollider`**：后者在角色同时接触地面与箱 / 交互物时会返回被污染的世界法线，且会返回形状并未真正接触的 speculative 接触。
- 未声明碰撞组的碰撞体 membership 全 1，会被解析为 `ground` 并挡下子弹（fail-closed）；类别位从 membership 第 5 位起，不参与交互。
