# 编辑模式（`modes/edit/`）

入口：主页启动屏第一个按钮"编辑模式"（`src/main.ts` 装配，复用主页渲染器与单 RAF 循环）。**物理世界默认冻结**，只有在执行面板驱动下才步进。

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

1. `characterSystem.clearBullets()` —— 清除执行期产生的子弹（子弹是战斗期临时对象，不属于任何实体系统、不进存档，详见 [`docs/attack_system.md`](attack_system.md) §5.4）；
2. `clearAllEntities(systemsByType, allTerrainSources)` —— 逐系统移除全部存档实体（角色、箱子、碎片、地形、水等）。

新增"执行期临时对象"（不参与存档、由子系统内部持有的场景对象）时，必须挂到 `clearWorld()` 上，否则会残留到还原后的世界里。

## 其他控制（默认绑定，均可在操作设置面板修改）

| 类别 | 默认操作 | 实现 |
|------|----------|------|
| 视角旋转 | 鼠标左键拖拽（俯仰限 ±90°） | `modes/camera_common.ts` `setupMouseOrbit` |
| 相机移动 | WASD 前后 / 左右 + Z 升 / X 降 | `modes/camera_common.ts` `setupKeyboardCamera` → `modes/free_flight.ts` |
| 选中 | 左键点击实体选中，点击空白取消 | `modes/edit/pointer_interaction.ts` |
| 变换 | 拖拽 gizmo 平移 / 旋转圆弧；角色仅保留 Y 轴旋转 | `modes/edit/transform_gizmo.ts` |
| 生成 | 「生成物体」绑定（默认右键）在指针处生成当前生成类型 | `pointer_interaction.ts` + `modes/edit/spawn_mode.ts` |
| 地形雕刻 | 选中地形后滚轮升降（笔刷半径 / 强度见 `modes/edit/constants.ts`） | `pointer_interaction.ts` |
| 删除实体 | Delete（指针悬停在元素列表项上时） | `ui/element_list_panel.ts` |
| 其他面板 | 生成类型面板 / 元素列表面板 / 选中实体属性面板 / 相机 HUD | `ui/` |

## 相关文件

| 文件 | 职责 |
|------|------|
| `src/modes/edit/index.ts` | 编辑模式装配（相机、gizmo、指针交互、面板），返回 `updater` 与执行面板控制器 |
| `src/modes/edit/execute_panel.ts` | 执行面板 DOM 与交互状态机（语义约定见文件头注释） |
| `src/modes/edit/execute_panel.test.ts` | 面板交互契约单测：Execute/Stop/Reset 的派发规则与互斥 |
| `src/main.ts` | `executing` 与快照基线的持有者、`clearWorld()` 清空世界（实体 + 执行期子弹）、步骤排队消费、载入存档刷新基线 |
| `src/entity/character/physics/world.ts` | `CharacterEntitySystem.clearBullets()`：清除在飞子弹（物理刚体 + 场景 mesh） |
| `src/entity/character/physics/clear_bullets.test.ts` | 子弹清理单测：子弹确实产生、`clearBullets()` 连刚体与 mesh 一并移除、无子弹时空操作 |
