# 动作 / 骨骼 / 模型历史记录

> 状态：历史记录。**不代表当前实现**；当前行为以模块文档为准。
> 本文件承接从模块文档与 per-weapon 文档中移出的“修正记录 / 本轮重构 / 已删除资产”。

## 已删除资产

- `spear_two_handed_charge_thrust`：长枪双手蓄力突刺变体，已无对应攻击段；clip 与姿势修订已删除。
- `attack_clip_data.ts`：单文件 787KB 压缩关键帧表；已拆分为 `character/weapon/attack_clips/` 作者数据。
- `attack_pose_edits.ts`：基础轨道 + 逐段姿势补丁双源；已合并进作者数据。
- `appearance/two_handed_ik.ts`：运行时支撑手 IK；已改为离线烘焙。
- `entity/character/skeleton/preset.ts` / `hurt_blocks.ts` / `constants.ts`：已迁入 `forms/humanoid/`。
- `entity/character/skeleton/preset_appearance.ts`：无调用，已删除。
- `skeleton/anim/retarget.ts`：生产骨架与编辑器骨架同 id 后不再需要目标重定向，已删除。

## 历史设计变更

- 双手共持从“运行时逐帧 CCD 支撑手 IK”改为“生成期离线烘焙支撑手双轨”；基础状态只预烘焙肩肘双轨，身体仍由 `pose_fns` 生成。
- 攻击动画从“基础关键帧 + 姿势修订补丁”改为“按武器拆分的单一作者数据”。
- 节点 IK 从全局 `ikRootLevel` 改为末端节点 `SkeletonJoint.ik`（CCD / FABRIK + 父级段数）。
- 武器握持：从运行时外部偏移/倾斜节点改为模型固有握持烘焙；握持屈角由武器骨骼控制。
- 长枪蓄力深刺、战斧左右相位参数、旧 `ArmAnimConfig` / `phaseOffset` / `swingTilt` 等参数化动画已移除。

## 使用约定

- 新增动作调整请直接改当前作者数据或 `pose_fns`，不要把新方案写成本文件的“后续再做”。
- 修改 `pose_fns` / 武器网格 / 基础状态时长后运行 `pnpm bake:support-hands`。
