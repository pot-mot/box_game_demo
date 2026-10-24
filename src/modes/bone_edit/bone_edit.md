# 骨骼动画编辑模式（bone_edit/）

> 启动屏第 4 入口。上方 Three.js 视窗，下方时间轴/轨道面板；物理冻结，独立于生产动作链路。

## 1. 轨道编排

| 模式 | DOM | 数据来源 | 用途 |
|---|---|---|---|
| 轨道 | `#bone-timeline` | 每体形独立 `AnimationStore` | 逐关键帧精修、内置换行动作副本、导入导出 |

- 内置动作库由各体形 `BodyForm.animation.previewClip` 采样生产进度组合树烘焙；载入时深拷贝为可编辑副本，不保留独立的 base/attack clip provider。
- 动画列表不提供「删除动画」入口；仅支持新建、改名、载入内置动作。
- **不再提供函数编排模式**。

## 2. 体形切换

- `form_catalog.ts` 的 `BONE_EDIT_FORM_PROFILES` 覆盖 `BODY_FORM_IDS`（humanoid / wolf / horse / wyvern），每项提供 `preset`、默认武器与能力标记。
- `form_store.ts` 为每体形创建独立 `AnimationStore`，时间轴通过路由 store 读写当前体形，切换时互不覆盖。
- 切换体形聚焦该体形的骨架实体（不存在则经 `SkeletonPresetSource` 新建），并重置播放头/选择；非聚焦骨架隐藏且不参与拾取，避免多体形叠加。**不提供额外“骨架”下拉**：同一时间只操作体形下拉对应的当前骨架，内部按体形缓存编辑结果。
- 每帧在骨架 FK 后调用 `SkeletonAppearance.update`：翅膜等骨骼驱动部件在编辑器中同样随翼指 / 腕部拉伸。
- 撤销快照包含 `formId`，undo/redo 会恢复当时的体形、骨架与该体形动画库。
- 轨道模式显示武器控件，武器下拉按当前体形重建；切换体形自动同步到该体形默认武器（人形使用惯用手主手挂点，生物使用武器自带 `mountJointId`）。惯用手控件仅 humanoid 可见。
- **不再自动求解支撑手贴合**：双手共持动作由动画数据独立控制；如需手部反向驱动手臂，给末端节点配置节点 IK。

## 2.1 节点编辑与视图控制

- 点击选中节点/骨骼段；**不提供直接拖拽**，平移/旋转统一通过 Edit 模式同款 Gizmo（坐标轴 + 旋转圆弧）完成。
- 拾取只覆盖骨骼辅助层（关节小球 + 骨骼段菱形），模型部件不参与，避免躯干部件把点击映射到髋部关节。
- 每个关节可配置节点 IK：作为 IK 末端，选择求解器（CCD / FABRIK）与影响父级段数（默认 2）。配置后 Gizmo 平移该节点时始终由父级链求解，不再走级联平移。
- **不提供删除关节 / 骨骼段与父级重连**：骨架拓扑固定；仅允许位置、旋转、IK、骨骼长度 / roll 与添加子关节。
- 左上常驻 `#bone-view-panel`（相机信息下方，宽 200px、内容自适应高度）：允许编辑节点、显示节点、显示骨骼、显示模型四个独立开关；新建骨架沿用当前设置。
- 节点属性面板为独立固定浮层（`#skeleton-panel`）：顶部定位在右侧，最大高度扣除时间轴高度，内容超高时纵向滚动，不越出屏幕。

## 3. 导入导出边界

- `导出` 输出 `SkeletonAnimationAsset`（`formatVersion + skeleton + animations`），`导入` 目前只由本编辑器消费。
- **游戏运行时当前不读取该 JSON**：生产角色动画由 `body_form` 的进度组合树与代码 / 烘焙数据构建；导出资产没有 `formId` / 状态 / 武器段等稳定映射元数据，不能直接替换游戏动作。
- 若要接入运行时，必须先定义资产映射（体形 + 状态或攻击段 + clip 稳定 id），再由运行时检查关节 id 兼容性并作为进度组合叶子加载。

## 4. 可测试契约

- 时间轴 `#bone-timeline` 持续输出：`data-form`、`data-playhead-time`、武器/惯用手状态。
- 时间轴缩放输入 `#bone-timeline-zoom`：单位为 px/秒，输入有效数字后按回车应用；Ctrl+滚轮缩放时同步回写。
- 左侧视图面板 `#bone-view-panel` 输出：`data-edit-enabled`、`data-show-joints`、`data-show-bones`、`data-show-model`；复选框 `#bone-edit-lock` / `#bone-show-joints` / `#bone-show-bones` / `#bone-show-model`。
- 节点属性浮层 `#skeleton-panel`；节点 IK 控件为求解器下拉 + 父级段数输入。
- 体形下拉 `#bone-form-select`；不再有模式切换按钮。
- 单测：`form_store.test.ts`（体形库隔离）、`timeline_controls.test.ts`（缩放输入）、`timeline_tracks.test.ts`（轨道区显隐）。

## 5. 非目标

- 不修改 `forms/*/pose_fns.ts`、生产 `clips.ts`、武器攻击段数据。
- 不在编辑器内删除骨骼 / 轨道或重连父级。
- 不自动把编辑器动画写入生产动作链路。
