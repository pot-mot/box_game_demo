# 骨骼动画领域（skeleton/）模块约定

## 约定

- 基础构件：`bone.ts` / `joint.ts` / `ik.ts` / `transition.ts`。
- **节点 IK 仅为编辑器工具**：`SkeletonJoint.ik?: {solver: 'ccd' | 'fabrik', chainDepth: number}`。
  配置在**末端节点**上，`resolveIkChain(end, chainDepth)` 向上回溯指定父级段数（默认 2）；
  `solveIkChain` 按 solver 分发到 CCD / FABRIK。**只有骨骼动画编辑器的 Gizmo 拖拽会调用求解器**；
  生产动画系统写入骨架后不做任何 IK 求解（运行时无 IK，见根 `AGENTS.md` 高危红线）。
- **骨骼动画组合**：生产运行时统一使用 `body_form/common/skeleton_animation/progress_composition.ts`：
  层级边权重、每关节权重、normal 归一化、additive、coverage/rest、progress 映射与事件。
  旧时间轴 `composition.ts` / `factory.ts` 已删除；编辑器仍可用 clip 预览，但不得作为运行时第二条通路。
- 人形基础/攻击动画由 `humanoid/skeleton_animation/progress_graph.ts` 组为单一进度组合树，
  `progress_system.ts` 每物理步求值；基础 clip、攻击身体 clip、支撑手/持握/盾臂/行走腿/转向瞄准均为组合层。
  攻击作者数据由 `character/weapon/attack_clips/` 编译；支撑手来自 `generated/support_hand_attacks.ts`。
- 狼 / 马 / 双足飞龙由 `common/skeleton_animation/progress_creature.ts` 统一求值：
  基础 / 攻击 clip 为叶子，叠加转向/瞄准与 falling 垂直收腿层；运行时不再使用 clip player。
- **编辑器骨架预设注入**：`entity/skeleton/world.ts` 只接受 `SkeletonPresetSource`，体形定义与外观由
  `entity/character/skeleton/form_preset.ts` 注入，骨骼实体层不反向依赖具体体形。
- **骨架定义必须同时声明 `joints`（父子层级）与 `bones`（连接段）**：人形与狼 / 马 / 飞龙一致；
  生物骨骼段由 `body_form/common/creature_runtime/skeleton_bones.ts` 按关节静止位置生成。
- **父级可重连**：`connectJoint(parent, child)` 在 child 已有父级时会先自动断开旧连接，再挂到新父级；
  禁止自环，且 parent 不得是 child 的祖先/后代。编辑器关节面板提供父关节下拉重连（选项排除自身与后代）。
  重连只改层级，不改局部变换；运行期不要在高频路径频繁重连。

## 文档

- `docs/bone_animation/动作设计规范.md` — 坐标系与朝向、关节总表、旋转符号速查、阶段与相位、动作→改动位置映射（全局规范）
