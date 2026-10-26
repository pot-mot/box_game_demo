# 编辑模式（`modes/edit/`）

入口：主页启动屏第一个按钮"编辑模式"（`src/main.ts` 装配，复用主页渲染器与单 RAF 循环）。**物理世界默认冻结**，只有在执行面板驱动下才步进。

## 约定

- 纯摄像机操作（见 `src/modes/control/control.md`）、指针交互、地形雕刻开关。
- 与主循环的关系：执行面板（Execute / Stop / Step / Run / Reset）语义与快照基线生命周期见文档。

## 显示控制（实体列表上方）

- 实体列表按类型分组；归属某个箱庭的子实体会缩进列在对应箱庭行下方（`.dc-list-children`），归属失效时回到原类型分组。
- 实体列表上方常驻「显示控制」小面板（`modes/edit/debug_view_panel.ts`），五类角色调试可视化独立勾选、默认全部关闭：碰撞箱 / 攻击箱 / 受击箱 / 攻击检测区（橙检测箱 + 橙射程圆环）/ 视线扇形（蓝）。
- 勾选后对**全部角色**常态显示，且选中角色不会绕过开关；未勾选时即使选中也不显示。碰撞箱关闭只隐藏胶囊可视化，保留 `mesh` 供射线拾取与选中线框。
- 可视化本体由角色渲染层 [`render/debug_view.ts`](../../entity/character/render/debug_view.ts) 的 `CharacterDebugView` 提供（与展示模式共用），编辑模式只负责开关与帧数据；攻击箱默认 50% 不透明，命中 / 释放阶段恢复 100%。
- 角色系统接口：`CharacterEntitySystem.setDebugVisible(view, visible)` 独立控制；`setCollisionVisible(visible)` 保留为总开关（play / showcase 统一关闭全部调试可视化）。

## 陷阱

- **执行期不得复用旧渲染插值历史**：角色在创建 / 换体形 / 瞬移时会初始化插值 prev/curr。Execute 与单步分支若只调用 `syncPositions()`，模型会停在初始位姿而刚体 / 骨骼继续运动（失重、停住、闪现）。必须按 `syncTrueTransforms()` → `characterSystem.update()` → `captureRenderState()` → `syncPositions()` 顺序同步；编辑模式的单步 / 暂停不做滞后插值。
- 建筑笔刷启用时必须关闭指针实体选中 / 生成交互（`pointer.setEnabled(false)`），见 `src/entity/building_generator/building_generator.md`。
- 地形雕刻启用后仅关闭相机缩放、保留旋转 / 平移。

## 与主循环的关系

- `tick()` 中 `simActive = mode === 'play' || executing`：未执行且无排队步数时**不调用 `shared.world.step()`、不跑 `syncPositions()`**，物理世界完全静止，可直接编辑实体。
- 执行/暂停/还原状态由 `src/main.ts` 持有（`executing` 标志 + 世界快照 `snapshot`）；`src/modes/edit/execute_panel.ts` 只维护面板自身的交互状态，通过 `onToggle` / `onReset` 回调上报，世界快照不进面板。

## 执行面板（Execute / Stop / Step / Run / Reset）

| 控件 | 行为 |
|------|------|
| Execute | 按帧 Δt 变速步进物理世界（每子步 `< FIXED_TIME_STEP` 上限 `MAX_SUB_STEPS`）；若世界尚未步进过，同时把当前编辑状态记为**还原基线** |
| Stop | **只停止世界步进**，世界保持当前状态（不还原）；可再次 Execute 从当前状态继续 |
| Step | 暂停态下单击推进一步（`FIXED_TIME_STEP` = 1/60s），逐帧检视碰撞 |
| Run | 按输入框步数排队逐帧推进（`pendingSteps`，每帧消费 1 步） |
| Reset | **唯一的世界还原入口**：停止步进并把世界还原到最近一次基线（含清除执行期产生的子弹等临时对象） |

互斥规则：有待执行步数（Step/Run 排队）时 Execute 不可点击；执行中 Step/Run 不可点击。

### 快照基线的生命周期

基线语义 = **最近一次「世界尚未步进」时的编辑状态**（`src/main.ts` 的 `steppedSinceBaseline` 标志守卫）：

1. 进入编辑模式时记录一次（当前编辑内容）；
2. 世界被步进之前（Execute / Step / Run 任一步进路径之前）按 Execute 会重新记录基线 —— 暂停期间的编辑因此不会被 Reset 丢弃；
3. 世界一经步进，基线即固定：`Execute → Stop → 再次 Execute` 不会移动 Reset 的还原点，Reset 始终回到"本次步进开始前"的编辑状态；
4. `Ctrl+O` 载入存档后重新记录（载入内容取代原编辑内容，避免 Reset 回退到载入前的世界）；
5. Reset 还原后立即用还原结果刷新基线，保证连续 Reset 幂等。

面板只负责派发意图：`onToggle(true)` = 开始步进、`onToggle(false)` = 停止步进（**不还原**）、`onReset()` = 停止步进并还原。

### 世界清空（Reset / 载入存档）

`main.ts` 的 `clearWorld()` 是唯一的"清空世界"入口，由 Reset 与载入存档共用：

1. `characterSystem.clearBullets()` —— 清除执行期产生的子弹（子弹是战斗期临时对象，不属于任何实体系统、不进存档，详见 [`weapon.md`](../../character/weapon/weapon.md) §5.4）；
2. `clearAllEntities(systemsByType, allTerrainSources)` —— 逐系统移除全部存档实体（角色、箱子、碎片、地形、水等）。

新增"执行期临时对象"（不参与存档、由子系统内部持有的场景对象）时，必须挂到 `clearWorld()` 上，否则会残留到还原后的世界里。

## 其他控制（默认绑定，均可在操作设置面板修改）

| 类别 | 默认操作 | 实现 |
|------|----------|------|
| 相机（纯摄像机方案） | 左键拖拽转视角（俯仰限 ±90°）、右键拖拽平移、滚轮缩放、WASD 前后 / 左右 + Z 升 / X 降，按住 `boost`（默认 Shift）加速 | `modes/control/camera_control.ts` `createCameraControl` |
| 显示控制 | 实体列表上方面板勾选碰撞箱 / 攻击箱 / 受击箱 / 攻击检测区 / 视线扇形（默认全关） | `modes/edit/debug_view_panel.ts` |
| 选中 | 左键点击实体选中，点击空白取消 | `modes/edit/pointer_interaction.ts` |
| 变换 | 拖拽 gizmo 平移 / 旋转圆弧；角色仅保留 Y 轴旋转 | `modes/edit/transform_gizmo.ts` |
| 生成 | 「生成物体」绑定（默认 Ctrl+左键）在指针处生成当前生成类型（含箱庭）；坐标按类型对齐（角色 / 交互物 0.5 格，其余含箱庭 1 格，三轴） | `pointer_interaction.ts` + `modes/edit/spawn_mode.ts` + `spawn_alignment.ts` |
| 地形雕刻 | 选中地形后，在**地形雕刻面板**主动勾选「启用（滚轮雕刻）」，滚轮升降（笔刷半径 / 强度见 `modes/edit/constants.ts`）；勾选期间仅关闭相机滚轮缩放，保留旋转 / 平移 | `entity/terrain/base/edit/sculpt.ts` + `entity/terrain/base/ui/sculpt_panel.ts` |
| 删除实体 | Delete（删除当前选中元素；无选中时删除指针悬停的列表项） | `ui/element_list_panel.ts` |
| 其他面板 | 生成类型面板 / 元素列表面板 / 选中实体属性面板 / 相机 HUD | `ui/` |

地形实体的属性面板含位置 X / Y / Z、旋转、生成器、高度区间与网格尺寸；Y 表示地形原点（网格基准面）的世界高度，可经面板输入或 gizmo Y 轴拖拽调整（`entity/terrain/base/physics/index.ts` 的 `add` / `updatePosition` / `setTransform` 均以传入 y 为原点）。

## 相关文件

| 文件 | 职责 |
|------|------|
| `src/modes/edit/index.ts` | 编辑模式装配（相机、gizmo、指针交互、面板），返回 `updater` 与执行面板控制器 |
| `src/modes/edit/execute_panel.ts` | 执行面板 DOM 与交互状态机（语义约定见文件头注释） |
| `src/modes/edit/spawn_alignment.ts` | 生成坐标对齐纯函数（按模式取 0.5 / 1 步长，三轴对齐并归一化 -0） |
| `src/modes/edit/debug_view_panel.ts` | 实体列表上方的显示控制面板（碰撞 / 攻击 / 受击 / 检测） |
| `src/character/debug_views.ts` | 角色调试可视化分类常量与类型 |
| `src/modes/edit/execute_panel.test.ts` | 面板交互契约单测：Execute/Stop/Reset 的派发规则与互斥 |
| `src/main.ts` | `executing` 与快照基线的持有者、`clearWorld()` 清空世界（实体 + 执行期子弹）、步骤排队消费、载入存档刷新基线 |
| `src/entity/character/physics/world.ts` | `CharacterEntitySystem.clearBullets()`：清除在飞子弹（物理刚体 + 场景 mesh） |
| `src/entity/character/physics/clear_bullets.test.ts` | 子弹清理单测：子弹确实产生、`clearBullets()` 连刚体与 mesh 一并移除、无子弹时空操作 |
