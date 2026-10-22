# 展示模式（二级菜单 + 子模块）

展示模式是一个**多子系统的展示 / 图鉴 / 人员测试**平台：进入后先显示二级菜单，选择要展示的子系统，再装配对应子模块。每个子模块自建独立 Three 场景（复用主页共享渲染器与单 RAF 循环），可随时「返回展示菜单」切换。

## 约定

- 二级菜单 + 子模块注册表（`ShowcaseModule` / `SHOWCASE_MODULES` / `SHOWCASE_MODULE_IDS`）；共享主页渲染器与单 RAF 循环，可返回启动屏。
- 相机类子模块用纯摄像机 `createCameraControl`，含玩家子模块用玩家主控 `createPlayerControl`（见 `src/modes/control/control.md`）。
- 新增子模块：在 `module.ts` 的 `SHOWCASE_MODULE_IDS` 加 id → 新建 `modules/<id>.ts` → 在 `modules/index.ts` 登记 → 在 `locales/showcase.ts` 加文案 → 补测试（`modules.test.ts` 自动校验注册一致性）/ e2e。

## 陷阱

- 子模块若自建 `SharedWorld`，**一律经 `physics/fixed_step.ts` 的 `createFixedStepStepper` 步进**（清力内聚在运行器内）；**严禁**手写 `world.step` / `eventBus.drain` 子步循环（曾因漏清力导致玩家跳跃时无限升空）。

## 入口

- 主页 http://localhost:5173/（`pnpm dev`）启动屏第三个按钮「展示模式」→ **二级菜单**。
- 菜单选择子模块进入；模块顶部常驻「← 返回展示菜单」按钮。
- 退出走右上角设置菜单「🏠 返回主页面」（`setupSettingsPanel` 的 `onReturnHome` 覆写为优雅退出：释放当前子模块与菜单后重现启动屏）；菜单 z-index（150）低于设置面板（200），返回主页全程可点。
- 展示模式不加载存档元素，为独立干净场景。

## 架构

```
src/modes/showcase/
├── module.ts          # ShowcaseModule / ShowcaseModuleHost / ShowcaseModuleRuntime / SHOWCASE_MODULE_IDS
├── index.ts           # 控制器：二级菜单 + 子模块宿主（updater 委托当前模块；exit 统一释放）
├── menu.ts            # 二级菜单（条目卡片 + 选择回调，文案经 i18n）
├── scene.ts           # 独立 Scene + 灯光 + 无限网格 + 自由飞行相机（WASDZX 平移 + 拖拽转视角 + 聚焦环绕）
├── focus.ts           # 点击聚焦拾取器（统一「聚焦」指针动作 + 射线拾取 → 相机聚焦 + 脚下呼吸圆环标记，供非角色舞台子模块复用）
├── actor_stage.ts     # 共享舞台：场景 + 自由飞行相机 + 多 Tab 展示角色 + 聚焦环 + 暂停/单步/变速 + 调试箱开关 + 信息面板
├── panel.ts           # 信息面板（标题 / 副标题 / Tab 栏可定制；含调试箱开关）
├── actor.ts           # 武器攻击展示角色驱动器（支持体形：人形 / 龙 / 马 / 狼）
├── race_actor.ts      # 种族 / 套装展示角色驱动器（站立/行走循环）
├── creature_actor.ts  # 体形（狼 / 马 / 双足飞龙）展示角色驱动器（站立/行走循环）
├── actor_debug.ts     # 展示角色调试箱（物理碰撞箱 / 受击箱 / 攻击箱，逐种开关）
├── label.ts / actor_handle.ts / constants.ts
└── modules/
    ├── index.ts       # SHOWCASE_MODULES 注册表（顺序即菜单顺序）
    ├── actions.ts     # 攻击模组展示（Tab：人 / 龙 / 马 / 狼）
    ├── appearance.ts  # 装备与外观图鉴
    ├── ai_terrain.ts  # AI 行为 × 复杂地形
    ├── terrain.ts     # 复杂地形与建筑
    ├── interactables.ts # 交互物交互效果
    ├── catalog.ts     # 全物品图鉴
    └── inventory.ts   # 背包与格子交互
```

- **`ShowcaseModule`**：`{id, title, description, setup(host) → {updater, dispose}}`。`title` / `description` 为 i18n 文案键（强类型 `StringLocaleKey`）；`setup` 接收宿主 `{renderer}`，自建场景并返回每帧 updater 与释放函数。
- **控制器**：持有 `SHOWCASE_MODULES` 注册表，`selectModule` 释放当前模块、装配新模块并隐藏菜单；`backToMenu` 释放模块、显示菜单；`exit` 释放模块 + 菜单 + 返回按钮后回调宿主。无激活模块时 updater 为空操作（菜单覆盖画布）。
- **`actor_stage.ts`**：把「独立场景 + 自由飞行相机 + 多 Tab 展示角色 + 聚焦环 + 点击拾取 + 空格暂停/Esc 取消聚焦 + 调试箱开关 + 信息面板」这套通用编排集中一处，供 `actions` / `appearance` 复用。子模块按 `tabs`（`ActorStageTab[]`，单 Tab 不显示 Tab 栏）提供各自 `populate(scene, register)`；切换 Tab 时隐藏旧 Tab 角色、重建面板行、复位聚焦。面板含 **3 个调试箱开关**（物理碰撞箱 / 受击箱 / 攻击箱，默认全关，由 `actor_debug.ts` 逐角色实现）。
- **相机（两套方案）**：相机类子模块使用共享**纯摄像机** `modes/control/camera_control.ts`——`W/A/S/D` 前后左右、`Z/X` 升 / 降（`MOVE_STEP`，随相机偏航角），按住 `boost` 动作（默认 Shift）加速飞行；「旋转视角」绑定（默认鼠标左键）拖拽转视角、「平移视角」绑定（默认右键）拖拽平移、滚轮缩放；「聚焦」绑定（默认左键点击）命中角色 / 物件进入**聚焦**（相机平滑飞向目标并环绕，期间暂停自由移动），`Esc` 或点击空白恢复自由飞行。旋转 / 平移 / 聚焦均为可重绑的指针动作（操作设置面板「鼠标」分组）。**含玩家的子模块**（交互物 / 背包）使用共享**玩家主控** `modes/control/player_control.ts`：相机第三人称跟随玩家、鼠标拖拽环绕、滚轮缩放，`Shift` = 翻滚，**不提供右键平移**。
- **新增子模块**：在 `module.ts` 的 `SHOWCASE_MODULE_IDS` 加 id → 新建 `modules/<id>.ts` → 在 `modules/index.ts` 登记 → 在 `locales/showcase.ts` 补 `showcase.module.<id>.title/desc` 与模块内文案 → 补单测（`modules.test.ts` 自动覆盖注册表一致性）/ e2e。

## 子模块

### 攻击模组展示（actions）

以 **Tab** 切换 人 / 龙 / 马 / 狼 各自攻击模组的展示台：人形 Tab 为全武器攻击动作（近战 6 武器 × 3 持握模式分三排 + 远程 9 单排 + **盾牌 3 件**：攻击模组 = 盾击，待机时经 `AnimationContext.shieldHands` 演示**格挡举盾姿态**），龙 / 马 / 狼 Tab 展示该体形的天然 / 允许武器（龙 = 爪击 / 吐息；马 = 踢击 / 长枪 / 飞斧；狼 = 撕咬 / 短剑 / 长剑）。每角色循环播放其连段（轻链 → 停顿 → 重链），信息面板复现段计时。

- 人形清单条目按**武器 id + 持握模式**（`SHOWCASE_ROSTER`）；立体形角色经 `createShowcaseActor({bodyFormId, weapon, holdMode})` 用 `bodyFormOf(id).createModel` / `createAnimation` 构建（人形 = 默认）。武器参数与攻击链经 `weaponPresetOrDefault(id)` + `weaponAttacksOf(weapon, holdMode)` 取自武器模组。
- 近战演示按该武器该模式的段展示顺序连播 → 停顿 0.6s（模拟松开攻击键）→ 重链 → 收尾待机 → 循环；每个**重击段播放前**先**缓慢蓄力**（与生产一致的蓄力前置：按段**有效蓄力时长** `segment.chargeFullTime` 逐帧推进，缺省回退常量 `CHARGE_HOLD_DURATION`，面板进度与 `attackCharge` 由 0 爬升到 1），随后从抬手段末续播该段（不重播抬手）。每段 tilt 为段固有值。
- 段展示顺序 = `orderedSegments` 全量枚举，**含空中攻击段 `air`**（如短剑·单持：轻1/轻2/重1/重2/空中1 共 5 行）。展示台无跳跃，空中段按**自烘焙 clip** 站立播放（见 weapon.md §3.8）。
- 副手展示：单持不装备副手；双持左手握同类武器；双手共持副手挂背（`backWeaponMount`）且双手 IK 贴合主手武器。远程为单段开火动作（不发射弹丸）。
- 面板/控制：暂停/继续（空格）、单步、速度 0.1/0.25/0.5/1×；「聚焦」绑定（默认左键点击）点击角色或下拉聚焦（Esc 取消），其余角色变暗；WASDZX 自由飞行 / 旋转视角 / 平移视角 / 滚轮缩放（聚焦期间暂停自由移动、锁定缩放）。聚焦详情卡复现 play HUD 的段计时区块（每段一行，动作/恢复/冷却三格）。

**与生产代码的镜像关系**：连段时序镜像 `states/attacking/` 段子状态机（阶段推进 + 段末推进）；攻击数据镜像武器模组（`orderedSegments(weaponAttacksOf(...))`）；动画注入镜像 `world.ts` 的 `AnimationContext` 装配；刀光镜像 `world.ts`（strike/release/spin 激活）。冷却计时镜像生产（触发即挂、逐帧递减，仅展示不阻断推进）。

**刻意差异**（代码注释已标注）：站立攻击（水平速度恒 0）；缓冲恒有值（段末自动推进）；省略 hitbox / hitstop / 命中执行器。

### 装备与外观（appearance）

种族 / 整套护甲 / 体形图鉴：第一排三族肢体（骷髅 / 兽人 / 精灵，四槽同族肢体 replace，各自独立阵营着色）；第二排起按材质展示**整套护甲**（布 / 皮 / 铁 / 鳞 / 石 / 法师，各四槽齐全，`ARMOR_SET_SHOWCASE`，每行 3 套）——**以整套为整体预览，不单件展示**；末排展示非人形体形（狼 / 马 / 双足飞龙 wyvern，`CREATURE_SHOWCASE_ROSTER`）。共 **12** 个展示角色（3 种族 + 6 套护甲 + 3 体形）。全部角色站立 2s ↔ 行走 2s 交替循环（`RACE_SHOWCASE_HOLD_SECONDS`），位置原地不动，纯外观展示。

- **体形展示**（`creature_actor.ts`）：经 `bodyFormOf(id).createModel` / `createAnimation` 构建非人形角色，动画上下文注入镜像 `world.ts`（行走时 `horizontalSpeed = ACTOR_SPEED`）；标签高度按模型实际包围盒计算（各体形身高差异大），避免标签压进身体。

### AI 行为 × 复杂地形（ai_terrain）

内容：FBM 起伏地形（`AI_TERRAIN_*`）+ 中央低墙（高度低于跳跃高度，触发导航跳跃）+ 红蓝双阵营各 5 个单位（近战 / 远程混合、三档战斗策略 aggressive/tactical/cowardly），阵营互相敌对（`hostileExceptSelf`）——展示不同 AI 在同一复杂地形中的寻路、障碍跳跃与面向敌对阵营的索敌 / 追击 / 攻击行为。

- 物理：模块自建 `SharedWorld`（地形 trimesh + 障碍 + 角色），每渲染帧经 `physics/fixed_step.ts` 的 `createFixedStepStepper` 按 `main.ts` play 模式同一固定步策略推进：累加器决定本帧 `0..MAX_SUB_STEPS` 个物理步（不追赶、欠账丢弃）→ `beforeStep` → `world.step` → `eventBus.drain` → 各系统 `preSync` → `syncTrueTransforms` → `fixedUpdate`（角色状态机 / 动画 / 计时器）→ `captureRenderState`；全部步结束后 `syncPositions(alpha)` 写滞后一拍渲染插值。运行的是与生产同一套 AI / 物理 / 状态机运行时（人员测试镜像）。运行器内聚「每物理子步结束后清力」（`clearAllForces`）——施力为每物理步瞬态语义，漏清力会让 idle / 站定攻击的坡面反重力力残留、抵消重力，角色跳跃后持续升空。
- 相机默认俯视战场全貌（`setDistance` 取初始距离），可用 WASDZX 自由飞行、拖拽旋转 / 平移 / 缩放。
- 左侧 HUD 逐角色列出面板行文本（HP / 武器 / 防御 / 移速 / 状态机状态）与阵营色点；「重开战斗」按钮清子弹、移除并重新生成双方单位、重建 AI 上下文，便于反复观察。

### 复杂地形与建筑（terrain）

内容：一片 FBM 起伏地形（`TERRAIN_*`）+ 全部 **12 种建筑生成配方**（平房 / 塔楼 / 城墙 / 平台 / 废墟 / 树木 / 阶梯 / 旋转楼梯 / 廊桥 / 大殿 / 主楼 / 箱庭）按网格摆放，建筑基座自动贴合地形高度。

- 复用生产同一套 `setupTerrain` + `setupBuildingGenerator`（稀疏体素块存储、贪心网格合并、粗 LOD、按距离卸载、近处 trimesh 碰撞体）；每帧调用 `building.updateView(camera, dt)` 摊还构建分块网格（静态建筑不参与物理步进）。
- 左侧面板可切换**地形生成器**（FBM / 正弦 / 阶梯 / 平坦）与「随机重建」：切换生成器会重铺地形并按新高度重新放置全部建筑，随机重建换种子重生成。
- **点击聚焦**：点击某栋建筑即把相机飞向它（聚焦距离随建筑尺寸）、并在其脚下显示**呼吸圆环标记**（随建筑尺寸放大），`Esc` / 点击空处恢复自由飞行。
- 建筑配方名 / 地形生成器名复用编辑模式 `recipe.*` / `terrain_gen.*` 文案键。

### 交互物交互效果（interactables）

内容：摆放 **7 类交互物**（存档点 / **两个传送点** / 开关 / 单开门 / 双开门 / 升降闸门 / 升降梯），全部**置于地面**（体素自底面 y=0 向上搭建）。

- 使用生产同一套 `InteractableContext`（行为 / 动画 / 信号）；**开关只联动闸门**（同频道 `setSignal`），不再触发所有交互物。
- **简化版玩家**：`WASD` 移动（以相机偏航为基准）、空格跳跃、`Shift` 翻滚（玩家主控方案，与 play 一致）、`F` 触发最近交互物（面板实时显示最近交互提示）、`K` 直接击杀玩家；玩家使用生产 `CharacterEntitySystem` + 物理固定子步（`createFixedStepStepper`），站上升降梯会被平台带走。
- **相机跟随玩家**（鼠标拖拽环绕、滚轮缩放；WASD 让给玩家），聚焦交互物时临时接管、取消后恢复跟随。
- **两个传送点**：激活其一即把玩家传送到另一个，演示传送效果。
- **存档点 + 击杀**：`K` 或「击杀玩家」按钮清空生命触发死亡动画，延时后在最近激活的存档点重生（无存档点则回出生点）。
- **升降梯**：乘客由角色系统按**物理接触**、在物理步进**前**位置携带（平台瞬移 + 注册速度 → 角色 `applySupportCarry`，见 AGENTS 移动平台陷阱）；乘坐到任意高度按 `F` 可**就地停止 / 继续 / 端点反向**，提示随状态在「上升 / 下降 / 停止 / 运行」间切换。
- 左侧面板逐行列出交互物与「激活」按钮（存档点点燃 / 传送 / 门开合），另有「击杀玩家」「重置」按钮；领域钩子（`onSavePoint` / `onTeleport`）把事件回写到状态行。起到交互系统的人员测试效果。
- **点击聚焦**：点击某交互物即把相机飞向其中部、并在其脚下显示**呼吸圆环标记**（随尺寸放大；仅聚焦、不触发激活），`Esc` / 点击空处取消聚焦并恢复跟随。

### 全物品图鉴（catalog）

以**格子 + 预览**呈现 `ITEM_DEFS` 全量物品（全部武器 18（含 3 盾）/ 护甲 17 / 方块 8 + 消耗品 / 材料 / 钥匙，共 46 件，由 `items.test.ts` 对照武器 / 护甲目录与实体类型锁定完整性）：右侧面板提供类别筛选标签（全部 / 武器 / 护甲 / 方块 / 消耗品 / 材料 / 关键物品）与物品格子——每格按类别着色并显示该物品专属图标（`ItemDef.icon`，与背包同一套）；点击格子即选中并在左侧 3D 场景**预览**——武器 / 护甲在展示人体上即时装配（武器 → 主手、护甲 → 对应槽），方块以代表方块模型（复用各方块渲染模块底色）呈现、其它物品以类别色方块呈现。详情卡复用同一图标。相机默认自由飞行并对准展示人体（`CATALOG_CAMERA_DISTANCE`），WASDZX 可自由环绕观察。起到玩家图鉴效果。

### 背包与格子交互（inventory）

复用 play 模式的俄罗斯方块背包面板（`modes/play/inventory_ui`）、双栏容器面板（`modes/play/container_ui`）与装备模型预览（`modes/play/equipment_ui`），注入一份演示背包（全武器 / 全护甲 + 消耗品 / 材料 / 钥匙），支持拖拽移动、`R` 旋转、拖到环绕装备槽装备、点装备槽卸下、丢弃，装备变化即时同步到面板预览**与场景内玩家模型**——完整复现 play 背包交互效果。

- **简化版玩家**：`WASD` 移动（以相机偏航为基准）、空格跳跃、`Shift` 翻滚、`F` 交互、`Tab`（与 `open_equipment` 键）开关背包；玩家使用生产 `CharacterEntitySystem` + 物理固定子步（`createFixedStepStepper`），相机跟随玩家（鼠标拖拽环绕）。
- **箱子 + 开箱**：地面放置一个箱子；走近按 `F` 打开 play 的双栏容器面板（玩家背包 ↔ 箱子，可拖拽 / 双击存取物品），状态行回写「已打开箱子」。
- 左上 HUD 显示标题 / 操作说明 / 最近交互提示 / 状态，并提供「打开背包」按钮；背包面板右上角带「关闭」按钮——开合均可不依赖键盘。
- **Tab 焦点**：输入注册表在游戏画面内拦截 `Tab` 的浏览器默认焦点切换（避免焦点跳到面板按钮后空格 / 回车误触），表单 / 下拉 / 按钮等可交互控件内仍保留默认导航（`src/input/registry.ts`）。

> `inventory` 子模块复用了 play 模式的 UI 组件；这些组件仅依赖 `inventory/` 领域层与外观 / 武器目录，属可复用 UI，不构成循环依赖。

## 验证

- 单元测试：
  - `src/modes/showcase/actor.test.ts` — 近战满蓄力前置。
  - `src/modes/showcase/race_actor.test.ts` — 种族 / 套装角色创建释放、站立行走 2s 交替循环、位置不动、肢体替换外观生效。
  - `src/modes/showcase/scene.test.ts` — 纯摄像机自由飞行（WASD 沿朝向平移、Z/X 升降、按住 boost 加速）、聚焦期间暂停自由移动、Esc 恢复自由飞行、跟随目标。
  - `src/modes/control/camera_control.test.ts` / `src/modes/control/player_control.test.ts` — 两套共享操作方案的单测（缩放门控、朝向、移动合成与翻滚边沿、锁定输入）。
  - `src/modes/showcase/focus.test.ts` — 点击聚焦拾取器：命中对象后相机平滑聚焦到目标点、脚下呼吸圆环标记显示并随尺寸缩放、点击空处取消聚焦并隐藏标记。
  - `src/entity/interactable/mesh.test.ts` — 单推门门轴（较宽水平边）落点正确（薄 X / 宽 Z 与宽 X 两种朝向）。
  - `src/entity/character/physics/support_carry.test.ts` — 移动支撑携带：被支撑角色获得平台线速度且不因 idle 阻尼逐帧累加；未注册支撑不携带。
  - `src/entity/character/physics/ground_state.test.ts` — 真实接触记录支撑刚体 handle、郊狼宽限与脱离返回空（支撑寄存器判定的基础）。
  - `src/entity/interactable/behaviors.test.ts` — 升降梯 `F` 停止 / 继续 / 端点反向、暂停不推进、信号清除暂停、提示随状态。
  - `src/modes/showcase/modules.test.ts` — 注册表与 `SHOWCASE_MODULE_IDS` 一一对应、标题/说明可本地化、id 唯一。
  - `src/modes/showcase/menu.test.ts` — 每个子模块渲染一张卡片、点击触发 `onSelect`、show/hide/dispose。
- e2e：`e2e/showcase.spec.ts` — 二级菜单 7 张卡片、攻击模组展示（人形 Tab 31 行 + 切龙 Tab 2 行）、外观模块 12 行、AI 模块 10 单位、地形模块 12 配方、交互物模块 8 行（含激活回写状态）、图鉴 56 格、背包模块（背包 / 装备面板 + 玩家 HUD）、聚焦段计时行顺序、返回展示菜单、经设置菜单返回主页面。
