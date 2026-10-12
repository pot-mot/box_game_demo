# 骨骼动画领域（skeleton/）模块约定

## 约定

- 基础构件：`bone.ts` / `joint.ts` / `ik.ts` / `transition.ts`。
- **骨骼动画组合**：`anim/composition.ts` 的 `composePoses(layers)` / `applyComposedPose(skeleton, layers)` 按**关节归一化加权平均**合成任意层（`PoseLayer = {clip, weight, progress}`），未被任何层覆盖的关节保留骨架当前值；单层有效贡献时走快速路径直接采样（零额外开销）。`anim/composed_player.ts` 的 `createComposedAnimationPlayer` 驱动组合播放与分层事件。
- 基础状态的分层（下半身/体态 + 按持握模式的上半身）在 `entity/character/appearance/clips/base_clips.ts` 中**离线预组合**为单 clip（`getBaseClipForHoldMode`，运行时单层播放）；需要运行时动态权重时用 `getBaseLayers` + `composePoses`；攻击段即 `segment.poses` 组合。

## 文档

- `docs/bone_animation/动作设计规范.md` — 坐标系与朝向、关节总表、旋转符号速查、阶段与相位、动作→改动位置映射（全局规范）
