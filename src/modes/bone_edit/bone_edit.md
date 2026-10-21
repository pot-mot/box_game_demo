# 骨骼动画编辑模式（bone_edit/）

> 启动屏第 4 入口。上方 Three.js 视窗，下方时间轴/函数编排面板；物理冻结，独立于生产动作链路。

## 1. 两种编排模式

| 模式 | DOM | 数据来源 | 用途 |
|---|---|---|---|
| 轨道 | `#bone-mode-tracks` | 每体形独立 `AnimationStore` | 逐关键帧精修、内置换行动作副本、导入导出 |
| 函数 | `#bone-mode-script` | 代码注册的 `ScriptedMotion[]`，JIT 烘焙 | 用语义关节函数快速预览/生成动作，再转回轨道精修 |

- 默认进入轨道模式；函数模式首次打开当前体形时懒烘焙，之后按 `formId` + 骨架定义指纹复用缓存（`script_cache.ts`）。
- 「重新烘焙」清空当前体形缓存并立即重算；骨架被改动后指纹变化也会自动重算。
- 「载入轨道」把当前脚本 clip 复制为新轨道动画，随后切回轨道模式。
- 函数模式只读代码注册动作，**不提供页面内代码编辑器**；新增动作改 `forms/<form>/script_motions.ts`。

## 2. 体形切换

- `form_catalog.ts` 的 `BONE_EDIT_FORM_PROFILES` 覆盖 `BODY_FORM_IDS`（humanoid / wolf / horse / wyvern），每项提供 `preset`、`motions`、默认武器与能力标记。
- `form_store.ts` 为每体形创建独立 `AnimationStore`，时间轴通过路由 store 读写当前体形，切换时互不覆盖。
- 切换体形聚焦该体形的骨架实体（不存在则经 `SkeletonPresetSource` 新建），并重置播放头/选择/脚本预览；非聚焦骨架隐藏且不参与拾取，避免多体形叠加。**不提供额外“骨架”下拉**：同一时间只操作体形下拉对应的当前骨架，内部按体形缓存编辑结果。
- 每帧在骨架 FK 后调用 `SkeletonAppearance.update`：翅膜等骨骼驱动部件在编辑器中同样随翼指 / 腕部拉伸。
- 撤销快照包含 `formId`，undo/redo 会恢复当时的体形、骨架与该体形动画库。
- 轨道模式显示武器控件，武器下拉按当前体形重建；切换体形自动同步到该体形默认武器（人形使用惯用手主手挂点，生物使用武器自带 `mountJointId`）。惯用手控件仅 humanoid 可见。
- **不再自动求解支撑手贴合**：双手共持动作由动画数据独立控制；如需手部反向驱动手臂，给末端节点配置节点 IK。

## 2.1 节点编辑与视图控制

- 点击选中节点/骨骼段；**不提供直接拖拽**，平移/旋转统一通过 Edit 模式同款 Gizmo（坐标轴 + 旋转圆弧）完成。
- 拾取只覆盖骨骼辅助层（关节小球 + 骨骼段菱形），模型部件不参与，避免躯干部件把点击映射到髋部关节。
- 每个关节可配置节点 IK：作为 IK 末端，选择求解器（CCD / FABRIK）与影响父级段数（默认 2）。配置后 Gizmo 平移该节点时始终由父级链求解，不再走级联平移。
- 右侧常驻 `#bone-view-panel`：允许编辑节点、显示节点、显示骨骼、显示模型四个独立开关；新建骨架沿用当前设置。
- 节点属性面板为独立固定浮层（`#skeleton-panel`），与编辑模式实体面板一致，不再被挤在画布下方。

## 3. 语义动作约定

- 原子函数：`forms/<form>/rig.ts`，返回 `JointEulers`（关节 id → 欧拉角三元组，或 `{rotation, position}`），表示相对静止姿态的偏移。每个函数只操作 1–2 个关节：躯干俯仰、颈/头偏转、张口、耳/尾、髋摆、膝屈、球节/飞节/跗关节与翼根/肘/腕/爪；四足与翼的关节 id 均按 canonical 解剖左右（`fl/fr/rl/rr`、`l/r`）命名。
- 合成：`forms/authoring/pose_compose.ts` 的 `mergePoses` 对同关节旋转分量相加、位置后写覆盖。
- 注册：`forms/<form>/script_motions.ts`，每项含稳定 `id`、i18n `nameKey`、`duration`、`loop`、`pose(t, total)`；当前四体形各注册 2–3 个示例（挥手/鞠躬/行军、摇尾/潜行/长嚎、点头/快步/刨蹄、振翼/咆哮/潜近），只用于编辑器预览，不进入生产动作。
- JIT：`forms/authoring/bake.ts` 校验 duration/重复 id/未知关节/有限数值，生成 `script:<formId>:<motionId>` clip；单动作失败只进入 `errors`，不阻断同体形其他动作。
- 新增体形：在 `BODY_FORMS` 注册体形 → 补 `rig.ts` + `script_motions.ts` → 在 `form_catalog.ts` 的 `SCRIPT_MOTIONS` 映射动作并配置能力标记。

## 4. 可测试契约

- 时间轴 `#bone-timeline` 持续输出：`data-authoring-mode`、`data-form`、`data-script-motion`、`data-baked-script-count`、`data-playhead-time`、武器/惯用手状态。
- 右侧视图面板 `#bone-view-panel` 输出：`data-edit-enabled`、`data-show-joints`、`data-show-bones`、`data-show-model`；复选框 `#bone-edit-lock` / `#bone-show-joints` / `#bone-show-bones` / `#bone-show-model`。
- 节点属性浮层 `#skeleton-panel`；节点 IK 控件为求解器下拉 + 父级段数输入。
- 函数面板 `#bone-script-panel` 输出：`data-form`、`data-baked-count`、`data-error-count`、`data-selected-script`；动作行带 `data-script-id`、`data-baked`。
- 进度条 `#bone-script-progress` 输出 `data-time` / `data-duration`。
- 体形下拉 `#bone-form-select`；模式按钮 `#bone-mode-tracks` / `#bone-mode-script`；脚本操作 `#bone-script-rebake` / `#bone-script-to-tracks`。
- 单测：`forms/authoring/authoring.test.ts`（合成/烘焙/四体形/缓存）、`form_store.test.ts`（体形库隔离）。
- e2e：`e2e/bone_edit.spec.ts` 覆盖双模式、体形切换、非人形控件隐藏与脚本转轨道。

## 5. 非目标

- 不修改 `forms/*/pose_fns.ts`、生产 `clips.ts`、武器攻击段数据。
- 函数编排结果只有显式「载入轨道」后才进入编辑器动画库；不会自动写入生产动作。
