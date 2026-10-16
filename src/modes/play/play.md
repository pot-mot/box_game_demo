# 游玩模式（第三人称）

入口：启动屏第二个按钮「游玩模式」（`src/modes/startup_screen.ts`）；与其它模式共享主页渲染器与单 RAF 循环，由 `main.ts` 调用 `setupPlayMode(...)`（`src/modes/play/index.ts`），返回 `updater` 接入统一调度。

## 约定

- 玩家主控（见 `src/modes/control/control.md`）：第三人称、状态机驱动、中键镜头锁定、交互 / 背包 / 装备 / 地图 / 脱困。
- 交互目标解析、提示与激活编排在 `interaction/`；背包 / 装备 / 地图 / 传送 / 脱困装配在 `hakoniwa.ts`（输入事件驱动，不占每帧 updater）。

## 陷阱

- play 交互脉冲由 `modes/play/interaction/` 每帧读取，且 `interaction.update(dt)` **必须早于 `characterSystem.update(dt)`**，否则交互脉冲晚一帧、目标守卫失效。
- 脱困不设快捷键，走右上角设置菜单「传送至最近存档点」（`setupSettingsPanel` 第三参，`hakoniwa.teleportToNearestSavePoint()`）。
- 装备模型预览独立 `WebGLRenderer` 必须惰性创建（见 `src/inventory/inventory.md`）。

## 相机

- 有玩家：第三人称环绕相机（`src/modes/control/player_control.ts` 的 `createPlayerControl`），以玩家身体中心为跟随点做帧率无关 EMA 平滑（`PLAYER_CAMERA_SMOOTH_FACTOR = 8`），抑制角色弹跳导致的抖动。攻击 / 锁定 / 交互与移动输入一并由该控制器编排（玩家主控方案）。
- 「旋转视角」绑定（默认鼠标左键）拖拽旋转，「滚轮」缩放（`PLAYER_CAMERA_MIN_DISTANCE` ~ `PLAYER_CAMERA_MAX_DISTANCE`）；「轻击」绑定（默认左键松开）/「重击」绑定（默认右键松开）触发攻击，攻击携带按住时长供蓄力守卫区分点按/长按，拖拽视角时该次攻击不触发。旋转 / 轻击 / 重击 / 锁定目标均为可重绑的指针动作（操作设置面板「鼠标」分组）。**玩家主控不提供右键平移**（右键 = 重击）。
- **远程蓄力（弓 / 投掷类）**：左键**按住**进入蓄力（角色冻结在拉弓/后引姿态，HUD 显示 `CHARGE` 进度条），**松开**出手；力度决定弓的射程·速度·伤害、投掷物的远近·伤害。按住后拖拽旋转视角（或窗口失焦）会取消本次蓄力，不出手。连弩 / 霰弹枪 / 法杖 / 魔杖不支持蓄力，仍为松开即发。
- 无玩家（未标记玩家或玩家死亡）：相机回退自由飞行（`src/modes/control/free_flight.ts` 的 `applyFreeFlightMovement`，按住 `boost` 动作加速）。
- 近战命中触发短促相机震动（`index.ts` 的 `applyHitShake`，叠加在相机更新之后）。

## 移动与翻滚（玩家主控方案）

- `WASD` 相对相机水平移动、空格跳跃、`Shift`（动作 `roll`）边沿触发**翻滚**；移动/翻滚/跳跃由 `createPlayerControl` 的 `move()` 统一读取并写入 `characterSystem.setPlayerMove`，应在角色状态机更新前调用。

## 持握模式切换（「切换持握模式」绑定，默认 Ctrl）

- 近战武器按 `availableHoldModes`（武器声明 ∩ 双持需副手同类近战）环切：单持 → 双手共持 → 双持 → 单持；`src/modes/control/player_control.ts` 的 `move()` 轮询输入动作 `cycle_hold_mode` 后调用 `characterSystem.cyclePlayerHoldMode()`。
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

## 箱庭子系统集成

- **不新增 `GameMode`**：启动屏「游玩模式」即箱庭游玩模式；`GAME_MODE_VALUES` 不变，避免改动输入模式映射、`main.ts` 模式分派与 `modeInfo` 序列化分支。子系统在 `setupPlayMode` 内装配，`updater` 串接进现有顺序（单 RAF，返回 `(dt)=>void`）。
- 跨系统依赖由 `main.ts` 传入（`systems: EntityInfoSource[]`、`building: BuildingGeneratorContext`、交互物系统）。
- 输入动作：交互 `interact`（默认 F）、背包 `open_inventory`（B）、装备 `open_equipment`（E）、地图 `open_map`（M）；脱困不设快捷键。新增动作须同步 `INPUT_ACTIONS` / `ACTION_LABELS` / `ACTION_GROUPS` / `DEFAULT_BINDINGS` / `registry.test.ts`。
- 关联模块文档：背包/物品/装备/容器见 `src/inventory/inventory.md`；交互物见 `src/entity/interactable/interactable.md`；建筑结构与箱庭配方见 `src/entity/building_generator/building_generator.md`；存档字段见 `src/save_load/save_load.md`。

## 地图、传送点与脱困（`map_ui/` + `hakoniwa.ts`）

- 地图面板 `modes/play/map_ui/`：2D `<canvas>` 俯视绘制，以 `building.getAll()` 的体素 bounds 为地形轮廓，标记玩家（三角朝向）、已知传送点（菱形）、存档点（篝火）；按 bounds + padding 等比映射，无建筑用固定半径。接口 `{setVisible, isVisible, toggle, beginTeleportSelect(onPick), update(MapData), dispose}`，`MapData` 含 `playerX/Z/Yaw`、`bounds`、`markers[{key,kind,name,x,z,known}]`。
- 传送点：来源为 `kind==='teleport'` 的交互物，每点唯一 `key`（推荐配置强制 `name` 唯一，key = `name`）。`TeleportRegistry` 收集世界坐标并维护 `known: Set<string>`——首次交互（或被其信号触发）即解锁，存档于 `modeInfo.play.teleports: {known: string[]}`（校验 `.catch([])` 回退）。
- 交互传送点：若已知点只有它自己 → 提示「传送点已解锁」；否则打开地图进入 `beginTeleportSelect`。选点后淡出 → `characterSystem.setTransform(playerId, {x, y+0.1, z}, rotDeg)` → 清速度 → 淡入；落点 y 取传送点保存的站立高度。
- 存档点 `save_point`：回满血 → 记录重生点 `{x,y,z,facing}` 到 `localStorage` 键 `box_demo_respawn`（JSON、带校验回退）→ `cacheSaveData`；死亡重载后回到该点。首次激活点亮外观并持久化 `on=true`。
- 脱困：右上角设置菜单「传送至最近存档点」（`setupSettingsPanel` 第三参 → `hakoniwa.teleportToNearestSavePoint()`）：优先最近**已点燃存档点**，无则最近**已解锁传送点**，都没有则不动作；传送将玩家 body 平移到目标点（略抬 0.5m）并清零速度、唤醒刚体。
- 地图 / 传送 / 脱困逻辑在 `modes/play/hakoniwa.ts` 装配（输入事件驱动），`updater` 中刷新地图标记。

## 血条与韧性 / 格挡 HUD

- 世界空间血条（`health_bar.ts`，投影到角色头顶）在血条下沿追加**韧性条**：`drawBar` 接收 `poise` / `maxPoise`，条高 `POISE_BAR_H`，颜色按剩余比例（> 0.25 用 `--dc-info`，否则 `--dc-danger`）。韧性每帧连续回充，`BarEntry` 记录 `lastPoise` / `lastMaxPoise`，仅当变化超过 `POISE_DRAW_STEP` 阈值才重绘，避免每帧重建纹理。
- 世界空间血条在**持盾单位**下方再追加一条**格挡槽条**（`GUARD_BAR_H`，`--dc-warning`）：仅当 `block?.guardMax > 0` 时占位（血条区相应压缩），`BarEntry` 记录 `lastGuard` / `lastMaxGuard`，随 `guard` 变化重绘。
- 玩家 HUD（`player_hud.ts`）在 HP 文本下显示韧性标签（i18n `play.hud.poise`）+ 竖向填充条；**持盾时**再显示格挡槽标签（i18n `play.hud.guard`）+ 填充条（`guardMax > 0` 才占位，破防后 `guard = 0` 仍显示）。`index.ts` 每帧传入 `player.combat.poise` / `poiseMax` 与 `guard` / `guardMaxOf(player.combat)`。

## 验证

- 单元测试：`src/modes/play/lock_on.test.ts`（角度归一化、偏角优先选取、半径/角度门控、默认身体中心点、额外锁定点优选与跟随、未知关节跳过、目标失效/脱锁/移除自动解除、非敌对与无玩家情形）；`src/character/lock_point.test.ts`（锁定点配置清洗）；`src/entity/character/physics/lock_points.test.ts`（存档写入/序列化/`setLockPoints` 过滤）；`src/save_load/validation.test.ts`（v5 可选字段回退）；`src/modes/play/lock_marker.test.ts`（白点显示/隐藏与位置跟随）；`src/modes/control/player_control.test.ts`（拖拽阈值前不解除锁定、键盘绑定边沿触发、移动合成与翻滚边沿）；`src/input/registry.test.ts` 锁定默认中键绑定。
- e2e：`e2e/operations_panel.spec.ts`（游玩模式鼠标分组列出「旋转视角 / 锁定目标」，中键改绑冲突确认）；`e2e/character_equipment.spec.ts`（面板添加额外锁定点并 Apply 回显）。
