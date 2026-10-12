# 角色物理（entity/character/physics/）模块约定

## 约定

- `world.ts` 每帧：`stateMachine.update(dt, entity)` → 状态直接操作 `entity.body`（`setLinvel` 等）→ `syncPositions()` 同步 body→mesh。
- 输入注入链路：`input/` 注册表动作抽象 → `modes/control/player_control.ts` 的 `move()` 每帧读取并调用 `characterSystem.setPlayerMove()` → `world.ts` 统一转成 `stateMachine.setInput()`，不直接调 move/jump。

## 陷阱

- 物理 body 与 three mesh 位置同步在 `syncPositions()` 中逐帧覆盖；手动移动 mesh 后要通过 `body.setTranslation` / `body.setRotation` 同步。
- **移动平台载客走「物理接触 + 步进前位置携带」**：移动平台（闸门/升降梯/未来载具）用 `setTranslation` **瞬移**（**禁止 `setNextKinematicTranslation`**：多子步下运动学体会把整帧位移压进首个子步，顶到乘客产生冲量 → 抖动），并每帧按位置/四元数差分得到速度注册进 `SharedWorld.movingSupports`（静止写 0）；`checkGround` 记录**真实接触**的支撑刚体 handle（郊狼宽限不赋值），在 `world.step` **之前**由 `applySupportCarry(dt)` 按平台位移/`ω·dt` 平移乘客位姿（**位置携带，不叠加速度**），对**所有被支撑角色（含 AI）**生效。**禁止**用 `config.size` 几何 / `PlayerAccess` 判定是否站在平台上。
- 地面接触法线必须经 `physics/contact_tracking.ts` 的 `queryColliderContacts` 取，禁止直接用 `Collider.contactCollider`（详见 `src/physics/physics.md`）。
