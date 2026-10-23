# 骨骼动画领域（skeleton/）模块约定

## 约定

- 基础构件：`bone.ts` / `joint.ts` / `ik.ts` / `transition.ts`。
- **节点 IK**：`SkeletonJoint.ik?: {solver: 'ccd' | 'fabrik', chainDepth: number}`。配置在**末端节点**上，`resolveIkChain(end, chainDepth)` 向上回溯指定父级段数（默认 2）；`solveIkChain` 按 solver 分发到 CCD / FABRIK。生产不再使用 `ikRootLevel`；双手共持由动画数据独立控制，编辑器 Gizmo 平移配置了 IK 的节点时调用同一求解器。
- **骨骼动画组合**：`anim/composition.ts` 的 `composePoses(layers)` / `applyComposedPose(skeleton, layers)` 按**关节归一化加权平均**合成任意层（`PoseLayer = {clip, weight, progress}`）；`composePoses` 只返回被覆盖的关节，`applyComposedPose` 写回时未覆盖关节保留骨架当前值；单层有效贡献时走快速路径直接采样。`anim/composed_player.ts` 的 `createComposedAnimationPlayer` 驱动组合播放与分层事件。
- 基础状态的分层（下半身/体态 + 按持握模式的上半身）在 `entity/character/body_form/humanoid/clips/base_clips.ts` 中**离线预组合**为单 clip（`getBaseClipForHoldMode`，运行时单层播放），并按 `weaponClassId` 合并预烘焙支撑手双轨；攻击段由 `character/weapon/attack_clips/` 作者数据编译并合并 `generated/support_hand_attacks.ts`。
- **编辑器骨架预设注入**：`entity/skeleton/world.ts` 只接受 `SkeletonPresetSource`（`defaultPresetId` / `presetIds` / `presetOf`），每个 `SkeletonEntity` 记录创建时的 `presetId`；体形定义与外观由 `entity/character/skeleton/form_preset.ts` 注入，骨骼实体层不反向依赖具体体形。
- **骨架定义必须同时声明 `joints`（父子层级）与 `bones`（连接段）**：人形与狼 / 马 / 飞龙一致；生物骨骼段由 `body_form/common/creature_runtime/skeleton_bones.ts` 按关节静止位置生成，编辑器据此显示连接段与骨骼轨道。

## 文档

- `docs/bone_animation/动作设计规范.md` — 坐标系与朝向、关节总表、旋转符号速查、阶段与相位、动作→改动位置映射（全局规范）
