# 骨骼动画领域（skeleton/）模块约定

## 约定

- 基础构件：`bone.ts` / `joint.ts` / `ik.ts` / `transition.ts`。
- **节点 IK 仅为编辑器工具**：`SkeletonJoint.ik?: {solver: 'ccd' | 'fabrik', chainDepth: number}`。
  配置在**末端节点**上，`resolveIkChain(end, chainDepth)` 向上回溯指定父级段数（默认 2）；
  `solveIkChain` 按 solver 分发到 CCD / FABRIK。**只有骨骼动画编辑器的 Gizmo 拖拽会调用求解器**；
  生产动画系统写入骨架后不做任何 IK 求解（运行时无 IK，见根 `AGENTS.md` 高危红线）。
- **骨骼动画组合**：`anim/composition.ts` 的 `composePoses(layers)` / `applyComposedPose(skeleton, layers)` 按
  **关节归一化加权平均**合成任意层（`PoseLayer = {clip, weight, progress}`）；
  `body_form/common/skeleton_animation/composition.ts` 进一步支持起止时间、**单关节权重 `jointWeights`**、
  clip 组合源、嵌套组合扁平化与动画模组整体烘焙。
- 基础状态的分层（下半身/体态 + 按持握模式的上半身）在 `body_form/humanoid/skeleton_animation/clips/base_clips.ts`
  中离线预组合为单 clip（`getBaseClipForHoldMode`，运行时单层播放），并按 `weaponClassId` 合并预烘焙支撑手双轨；
  攻击段由 `character/weapon/attack_clips/` 作者数据编译并合并 `generated/support_hand_attacks.ts`。
  下半身行走覆盖层在生产中经 `AnimationComposition` + 单关节权重合成。
- **编辑器骨架预设注入**：`entity/skeleton/world.ts` 只接受 `SkeletonPresetSource`，体形定义与外观由
  `entity/character/skeleton/form_preset.ts` 注入，骨骼实体层不反向依赖具体体形。
- **骨架定义必须同时声明 `joints`（父子层级）与 `bones`（连接段）**：人形与狼 / 马 / 飞龙一致；
  生物骨骼段由 `body_form/common/creature_runtime/skeleton_bones.ts` 按关节静止位置生成。
- **父级可重连**：`connectJoint(parent, child)` 在 child 已有父级时会先自动断开旧连接，再挂到新父级；
  禁止自环，且 parent 不得是 child 的祖先/后代。编辑器关节面板提供父关节下拉重连（选项排除自身与后代）。
  重连只改层级，不改局部变换；运行期不要在高频路径频繁重连。

## 文档

- `docs/bone_animation/动作设计规范.md` — 坐标系与朝向、关节总表、旋转符号速查、阶段与相位、动作→改动位置映射（全局规范）
