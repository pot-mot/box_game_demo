# 角色物理（entity/character/physics/）模块约定

## 约定

- `world.ts` 每帧：`stateMachine.update(dt, entity)` → 状态直接操作 `entity.body`（`setLinvel` 等）→ `syncPositions()` 同步 body→mesh。
- 输入注入链路：`input/` 注册表动作抽象 → `modes/control/player_control.ts` 的 `move()` 每帧读取并调用 `characterSystem.setPlayerMove()` → `world.ts` 统一转成 `stateMachine.setInput()`，不直接调 move/jump。游泳竖直意图 `swimLift`（镜头前向垂直分量 × 前后输入）同链路透传。

## 碰撞箱（两半胶囊）与受击子块

- 角色物理碰撞体由**体形计划**（`entity/character/body_form/`）的 `colliderLayout` 声明：人形 = 上/下半身两个半胶囊（竖直拼接等价原单胶囊），均 density 0、类别 `character`。实体持有 `colliders: RAPIER.Collider[]`（`mainCollider = colliders[0]`，地面/分离沿用首个）；改 scale 或换体形时按 `colliderLayout` 重建。
- 每帧在动画 + 根姿态之后，`syncCollidersFromNodes(entity, model)` 用碰撞节点 `lowerBodyCollider` / `upperBodyCollider` **相对模型根**的变换（`inv(rootWorld)·nodeWorld`，排除模型根朝向/姿势，静止与竖直拼接等价、随动画联动、不与翻滚/倒地耦合）写 `collider.setTranslationWrtParent/setRotationWrtParent`；俯卧游泳时由 `world.ts` 让两节点前倾 → 碰撞箱俯卧。
- **受击子块**（纯数学，不建物理体）：`refreshHurtBlocks` 按 `entity.hurtProfile`（人形 12 块）用关节上的视觉部件矩阵 + 几何尺寸世界化到 `entity.hurtBlocks`（随骨骼段长度 + 粗细对齐）；供近战 OBB / 远程点 / 爆炸球检定（见 [`../../combat/combat.md`](../../combat/combat.md)）。
- 区域（area）重叠采样取刚体全部碰撞体的世界 AABB 并集（兼容多碰撞体）。

## 盾牌：输入路由与遮挡体同步

- **按键路由**（`world.ts`）：`shieldHoldKeysOf(player)` 决定哪把攻击键长按格挡（主手盾 = 轻/重击键皆可，副手盾 = 仅重击键）。`beginPlayerAttackHold` 对盾键只记录按下时刻（不进蓄力）；`endPlayerAttackHold(key, held)`：已格挡 → 仅落盾；否则主手盾短按 `setPlayerAttack(key, held)` 出盾击，副手盾无攻击；`cancelPlayerAttackHold(key)` 按槽落盾。
- 展开时长累加 `playerShieldHoldTime`，`update` 计算 `playerBlockHeld`（`block !== undefined && guard > 0 && !isDead && state !== 'guard_broken' && holdTime >= block.holdThreshold`）并作为 `block` 参数传给 `stateMachine.setInput(...)`；`machine.update` 每帧把它同步到 `entity.combat.blockHeld`（`world.ts` 不再直接写 `blockHeld`）。AI 经 `ai/machine.ts` 同样注入 `block`。
- **盾遮挡体**：`syncShieldCollider(entity)` 在每实体执行器之前调用，懒创建**无父刚体的 parentless sensor**（`ColliderDesc.cuboid(cover/2)`、membership 仅 `categoryCollisionGroups(0,0,'shield')`、mask 0），仅 `blocking && guard > 0 && !isDead` 时 `setEnabled(true)`；位置 = `body 中心 − originToCenterY(scale) + cover 偏移`（`cover` 相对角色原点 / 脚底），朝向按 yaw 绕 Y 旋转并叠加 `offsetZ`。`remove()` 释放碰撞体并从 `shieldOwnerByHandle` 反查表移除。子弹经该表把 `collider.handle → 盾主 id`（见 [`projectile.md`](../projectile/projectile.md)）。


## 陷阱

- 物理 body 与 three mesh 位置同步在 `syncPositions()` 中逐帧覆盖；手动移动 mesh 后要通过 `body.setTranslation` / `body.setRotation` 同步。
- **移动平台载客走「物理接触 + 步进前位置携带」**：移动平台（闸门/升降梯/未来载具）用 `setTranslation` **瞬移**（**禁止 `setNextKinematicTranslation`**：多子步下运动学体会把整帧位移压进首个子步，顶到乘客产生冲量 → 抖动），并每帧按位置/四元数差分得到速度注册进 `SharedWorld.movingSupports`（静止写 0）；`checkGround` 记录**真实接触**的支撑刚体 handle（郊狼宽限不赋值），在 `world.step` **之前**由 `applySupportCarry(dt)` 按平台位移/`ω·dt` 平移乘客位姿（**位置携带，不叠加速度**），对**所有被支撑角色（含 AI）**生效。**禁止**用 `config.size` 几何 / `PlayerAccess` 判定是否站在平台上。
- 地面接触法线必须经 `physics/contact_tracking.ts` 的 `queryColliderContacts` 取，禁止直接用 `Collider.contactCollider`（详见 `src/physics/physics.md`）。
