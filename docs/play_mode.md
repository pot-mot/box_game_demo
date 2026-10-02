# 游玩模式（第三人称）

入口：启动屏第二个按钮「游玩模式」（`src/modes/startup_screen.ts`）；与其它模式共享主页渲染器与单 RAF 循环，由 `main.ts` 调用 `setupPlayMode(...)`（`src/modes/play/index.ts`），返回 `updater` 接入统一调度。

## 相机

- 有玩家：第三人称环绕相机（`src/modes/play/camera.ts` 的 `setupPlayCamera`），以玩家身体中心为跟随点做帧率无关 EMA 平滑（`CAMERA_SMOOTH_FACTOR = 8`），抑制角色弹跳导致的抖动。
- 「旋转视角」绑定（默认鼠标左键）拖拽旋转，「滚轮」缩放（距离 1 ~ 30 m）；左键短按松开轻击、右键松开重击，攻击携带按住时长供蓄力守卫区分点按/长按，拖拽视角时该次攻击不触发。
- **远程蓄力（弓 / 投掷类）**：左键**按住**进入蓄力（角色冻结在拉弓/后引姿态，HUD 显示 `CHARGE` 进度条），**松开**出手；力度决定弓的射程·速度·伤害、投掷物的远近·伤害。按住后拖拽旋转视角（或窗口失焦）会取消本次蓄力，不出手。连弩 / 霰弹枪 / 法杖 / 魔杖不支持蓄力，仍为松开即发。
- 无玩家（未标记玩家或玩家死亡）：相机回退自由飞行（`src/modes/free_flight.ts`）。
- 近战命中触发短促相机震动（`index.ts` 的 `applyHitShake`，叠加在相机更新之后）。

## 持握模式切换（「切换持握模式」绑定，默认 Ctrl）

- 近战武器按 `availableHoldModes`（武器声明 ∩ 双持需副手同类近战）环切：单持 → 双手共持 → 双持 → 单持；`src/modes/play/keyboard.ts` 轮询输入动作 `cycle_hold_mode` 后调用 `characterSystem.cyclePlayerHoldMode()`。
- 仅 Ctrl 单独按下时生效：`isActionActive('cycle_hold_mode')` 走最长组合遮蔽，Ctrl+S / Ctrl+O 按下时该动作被 `save_world` / `load_world` 遮蔽，不会误触发切换。
- 切换由 `world.ts` 的 `setHoldMode` 统一处理（重解析攻击链、清段冷却与当前段、同步副手挂背/回手）；HUD 装备行显示当前武器与持握模式。
- 副手装备与持握模式的显式选择在编辑模式角色面板「装备」区（副手武器下拉 + 持握下拉），存档字段 `offhand` / `holdMode`（v6）。

## 镜头锁定（「锁定目标」绑定，默认鼠标中键）

- 按下切换：已锁定 → 解除；未锁定 → 搜索并锁定；再次按下同样解除。绑定默认中键、可改绑键盘（鼠标路径走 `mousedown` 的 `matchesMouseButton`，键盘路径走 `wasActionPressed` 边沿）；手动拖拽旋转视角累计超过点击阈值（5px，与攻击 click/drag 判定一致）后解除，避免攻击点击时的指针抖动误解除。
- 选取规则（`src/modes/play/lock_on.ts` 的 `selectLockOnTarget`）：以玩家为圆心、水平距离 ≤ `LOCK_ON_RADIUS = 10` m，且相对**镜头水平朝向**偏角 ≤ `LOCK_ON_HALF_ANGLE = 60°` 的候选**锁定点**中，取偏角最小者（偏角相同取更近者）。候选 = 玩家可攻击角色（`combat.attackTendency` 判定，与近战命中过滤一致，排除玩家自身与已死亡角色）的全部锁定点。
- 锁定点（`src/character/lock_point.ts`）：每个角色恒有一个**默认锁定点 = 身体最中心**（`body.translation()`，下标 0），另有可配置的额外锁定点数组 `CharacterEntity.lockPoints`（关节 id + **关节本地**三维偏移；找不到关节的点跳过）。解析时按关节 Group（`Group.name = 关节 id`）刷新 `matrixWorld` 后 `localToWorld`，逐帧跟随动画。
- 配置入口：编辑模式角色面板「锁定点」区——默认身体中心点不可删除，额外点可增（关节下拉 + X/Y/Z 偏移）可删可改，Apply 经 `CharacterSystem.setLockPoints` 写入；持久化为 `CharacterSaveConfig.lockPoints`（存档 v5，旧档缺失回退空数组、非法条目安全剔除）。
- 锁定期间：相机环绕角以 `LOCK_ON_TURN_FACTOR = 10/s` 的指数速率平滑转向「玩家 → 目标」方向；视点以 `LOCK_ON_BLEND_FACTOR = 8/s` 在玩家与目标瞄准点之间混合（锁定/解除均平滑过渡，不跳变；解除后沿用最后瞄准点淡出回玩家），目标位于玩家与相机连线上，玩家保持入镜；仍可滚轮缩放、仍可移动/攻击。
- 锁定标记：白色圆点（`src/modes/play/lock_marker.ts`，直径 `LOCK_MARKER_DIAMETER`，关闭深度测试不被模型遮挡）标记**命中的锁定点**（`PlayerLockOn.getAimPoint()`，与相机瞄准点同一位置），目标失效或锁定点被移除即隐藏。
- 自动解除（逐帧校验）：玩家死亡/丢失、目标死亡或从角色列表移除、目标与玩家水平距离超过 `LOCK_ON_RELEASE_RADIUS = 12` m（迟滞，避免目标在搜索边界反复脱锁/重锁）、锁定期间命中的锁定点被移除。
- 控制器的角色系统最小接口为 `LockOnCharacterSource`（仅 `getPlayerCharacter` / `getAll`），锁定目标最小接口为 `LockOnActor`（`lockPoints` + `appearanceGroup`），相机最小接口为 `LockOnCamera`（仅 `getWorldDirection`），便于单元测试注入。

## 验证

- 单元测试：`src/modes/play/lock_on.test.ts`（角度归一化、偏角优先选取、半径/角度门控、默认身体中心点、额外锁定点优选与跟随、未知关节跳过、目标失效/脱锁/移除自动解除、非敌对与无玩家情形）；`src/character/lock_point.test.ts`（锁定点配置清洗）；`src/entity/character/physics/lock_points.test.ts`（存档写入/序列化/`setLockPoints` 过滤）；`src/save_load/validation.test.ts`（v5 可选字段回退）；`src/modes/play/lock_marker.test.ts`（白点显示/隐藏与位置跟随）；`src/modes/play/camera.test.ts`（拖拽阈值前不解除锁定、键盘绑定边沿触发）；`src/input/registry.test.ts` 锁定默认中键绑定。
- e2e：`e2e/operations_panel.spec.ts`（游玩模式鼠标分组列出「旋转视角 / 锁定目标」，中键改绑冲突确认）；`e2e/character_equipment.spec.ts`（面板添加额外锁定点并 Apply 回显）。
