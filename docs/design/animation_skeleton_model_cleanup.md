# 动作 / 骨骼 / 模型系统腐烂清理与重构计划

> 状态：执行中（核心完成，剩余测试收尾）
> 依据：HEAD `bc5fd76` 的静态审查（动作系统 / 骨骼系统 / 模型系统的文档、注释、测试）。
> 执行方式：本文件是唯一进度真相；每完成一个文件或一组文件，勾选对应条目并记录验证结果。

## 1. 背景

当前腐烂集中在四类：

1. **死代码 / 死数据靠测试续命**：`retarget.ts`、`AnimationHandler`、`preset_appearance.ts`、`spear_two_handed_charge_thrust`、测试专用导出与未使用常量。
2. **测试干测常量 / 自证**：测试复述生产常量、硬编码武器/关节列表、魔数阈值、自证式计数。
3. **文档把历史、临时、兼容写法当现状**：同一文档内同时存在“运行时 IK”和“离线烘焙”两套说法；per-weapon 文档仍引用已删除的 `TWO_HAND_GRIP_OFFSET`。
4. **结构性双源**：攻击数据 = 787KB 基础关键帧 + 89KB 姿势补丁；状态清单至少 8 份手写；生物基础状态时长与玩法时长脱钩。

## 2. 目标 / 非目标

目标：

- 人形实现物理搬入 `forms/humanoid/`；`appearance/` 只保留跨体形共享工具。
- 攻击段与基础状态的支撑手全部离线烘焙；生产运行时零 IK、零骨架/网格创建。
- 攻击动画数据按武器拆分、可读、单源（不再有基础轨道 + 姿势补丁）。
- 状态清单由 `CHARACTER_STATES` 派生，新增状态漏注册时编译失败。
- `weapon.md` 保持单模块文档，压缩到约 400 行，重复内容链接到 `combat.md` / `state_machine.md`。
- 删除全部已确认死代码、历史资产与测试豁免。

非目标：

- 不重做动作美术；迁移保持视觉等价。
- 不改变武器玩法数值与连段拓扑。
- 不新增同类武器的多模型测试（同类武器只做外观替换，支撑手按 `classId` 建表）。

## 3. 已确认不变量

- 人形分包物理搬家；`forms/humanoid/` 自包含。
- 基础状态只预烘焙**支撑手双轨**（左肩 / 左肘），身体动作仍由 `pose_fns` 生成。
- 只生成 canonical 右撇子数据；左撇子由 `mirrorClip` 派生。
- 同类武器只做外观替换；支撑手数据按 `classId` 键控，不增加多模型测试。
- 生成文件禁止手改；修改 `pose_fns`、武器网格或基础状态时长后必须运行 `pnpm bake:support-hands`。
- 历史修正记录移入 `docs/history/bone_animation.md`，模块文档只保留当前事实。

## 4. 执行清单

### WP0 文档与基线

- [x] 创建本文件并登记到 `AGENTS.md`
- [x] 记录当前 `pnpm type-check` / `pnpm test` / `pnpm test:e2e` 基线

### WP1 死代码清理

- [x] 删除 `src/skeleton/anim/retarget.ts` / `retarget.test.ts`
- [x] 删除 `AnimationHandler`（`appearance/types.ts`）
- [x] 删除 `entity/character/skeleton/preset_appearance.ts`
- [x] 删除 `spear_two_handed_charge_thrust`：数据、姿势修订、文档、测试豁免
- [x] 删除未使用常量：`WALK_ANIM_MAX_SPEED` / `HORIZONTAL_SPEED_SMOOTHING` / `HEAD_TURN_LIMIT`
- [x] 删除 `BASE_STATE_ENTRY_COUNT` 与 `RIGHT_WEAPON_MOUNT_JOINT` 测试专用再导出
- [x] 修复 `skeleton.ts` 的 `removeJoint` roll 重根重复应用 + 单测
- [x] 确认并删除 `CreatureShape` 未使用变体

### WP2 人形分包物理搬家

- [x] `appearance/model.ts` → `forms/humanoid/model.ts`
- [x] `appearance/assemble.ts` → `forms/humanoid/assemble.ts`
- [x] `appearance/pose_fns.ts` → `forms/humanoid/pose_fns.ts`
- [x] `appearance/system.ts` → `forms/humanoid/system.ts`
- [x] `appearance/armor_mesh.ts` → `forms/humanoid/armor_mesh.ts`
- [x] `appearance/builtin_catalog.ts` → `forms/humanoid/builtin_catalog.ts`
- [x] `appearance/clips/*` → `forms/humanoid/clips/*`
- [x] `entity/character/skeleton/preset.ts` → `forms/humanoid/skeleton.ts`
- [x] `entity/character/skeleton/hurt_blocks.ts` → `forms/humanoid/hurt.ts`
- [x] `entity/character/skeleton/constants.ts` → `forms/humanoid/constants.ts`
- [x] 拆分 `appearance/types.ts`（共享契约 + `CharacterModel`）
- [x] 拆分 `appearance/constants.ts`（共享 + 人形）
- [x] `createCharacterModel` 必须接收 `BodyForm`，打断循环依赖
- [x] 更新全部 import 与测试路径
- [x] `pnpm type-check` 清零

### WP3 支撑手离线烘焙基础设施

- [x] `WeaponMeshConfig` 增加 `supportGripOffset`，删除逐 id switch
- [x] 新增 `weaponSupportGripLocal(config)` 纯函数
- [x] 新增 `scripts/bake_support_hands.mjs`
- [x] `package.json` 增加 `bake:support-hands`
- [x] 生成 `support_hand_base.ts`（10 武器 × 14 状态，双轨）
- [x] 生成 `support_hand_attacks.ts`
- [x] 生成 `support_hand_fingerprint.ts`
- [x] 新增 `support_hand_merge.ts`
- [x] `AnimationContext` 增加 `weaponClassId`，`world.ts` 填充
- [x] `getBaseClipForHoldMode` 使用 `weaponClassId`，删除 `supportGripLocal`
- [x] `getAttackClipById` 合并预烘焙支撑手轨
- [x] 删除运行时 `bakeTwoHandedSupportHand` 调用
- [x] 新增 `support_hand_data.test.ts`（矩阵、残差、循环、fingerprint）

### WP4 攻击数据拆格式

- [x] 新增 `attack_clips/types.ts` / `build.ts`
- [x] 迁移 `short_sword.ts`
- [x] 迁移 `long_sword.ts`
- [x] 迁移 `heavy_sword.ts`
- [x] 迁移 `spear.ts`
- [x] 迁移 `dual_axe.ts`
- [x] 迁移 `war_hammer.ts`
- [x] 迁移 `shields.ts`
- [x] 迁移 `ranged.ts`
- [x] 迁移 `unarmed.ts`
- [x] 新增 `attack_clips/index.ts`
- [x] 删除 `attack_clip_data.ts` / `attack_pose_edits.ts` / `attack_clip_data.test.ts`
- [x] 简化 `attack_clips.ts`（无 overlay）
- [x] 新增 `attack_clips/data.test.ts`
- [x] 更新全部 import 与文档引用

### WP5 状态注册表 / 动画系统 / 生物时长

- [x] `state_machine/types.ts` 派生 `BaseClipState` / `BASE_CLIP_STATES`
- [x] `pose_fns.ts` / `base_clips.ts` 使用 `BaseClipState`
- [x] `system.ts` 删除手写 `ClipState` / `CLIP_STATES`
- [x] `AppearanceSystem` 只保留 `update`；删除 creature 空 `onStateChange`
- [x] 时间驱动状态统一传 `stateDuration`
- [x] 生物 `STATE_META` 完整化并 import 玩法常量
- [x] 抽取共享快照混合工具

### WP6 体形 / 编辑器 / 模型

- [x] `BodyForm.editor = {weaponControl, handedness}`
- [x] `form_catalog.ts` 删除 id 判断
- [x] `builtin_clips.ts` 吐息改用 `bodyFormOf(formId).breathModules`
- [x] provider 完整性测试

### WP7 测试治理

- [x] 重写 `support_hand_data.test.ts`
- [x] 重写 `attack_clips/data.test.ts`
- [x] 删除 `body_form.test` 尺寸字面量
- [x] 删除 `attack_clips.test` 的 `1.7/-0.45/-0.85`
- [x] 删除 `system.test` / `support_hand_bake.test` 的 `0.18` 魔数
- [x] 删除 `builtin_clips.test` 自证计数
- [x] `base_clips.test` 删除“15 关节”与常量自证
- [x] `armor_mesh.test` 无断言用例补断言或删除
- [ ] `gizmo_pointer.test` 改用投影计算
- [x] `weapon_equip.test` 动态武器列表 + 具名阈值
- [x] 生物测试复用 `BASE_CLIP_STATES`，删除历史断言
- [ ] Canvas 桩统一到 `src/test_setup.ts`
- [ ] 目标测试移除 `as unknown as`

### WP8 文档治理

- [x] 新建 `docs/history/bone_animation.md`
- [x] `weapon.md` 压缩到约 400 行
- [x] 修正 `weapon.md` 动画键 / 状态数 / `ALL_WEAPON_PRESETS` / 测试时间 / IK 段落
- [x] 修正 `appearance.md` 的 `getBaseClip`
- [x] 修正 `preset` 的“武器挂点不参与 clip”
- [x] 修正 `body_form.md` / `docs/design/body_form.md`
- [x] 修正 `待机.md` / `巨剑.md` / `长枪.md` / `持握模式动作.md` / `动作设计规范`
- [x] 更新 `AGENTS.md` 命令与模块索引

### WP9 验证

- [x] `pnpm type-check`
- [x] `pnpm test`
- [x] `pnpm test:e2e`
- [x] `pnpm build`
- [x] 手动 QA 清单

## 5. 验证命令

```powershell
pnpm type-check
pnpm vitest run src/character/weapon src/entity/character/forms/humanoid src/skeleton
pnpm test
pnpm test:e2e
pnpm build
```

## 6. 风险与回滚

- Euler 迁移误差：迁移时逐段对比新旧采样旋转，误差 < 1e-5；不通过不删除旧数据。
- 人形搬家 import 面大：以 `pnpm type-check` 为清单逐项修正，不保留兼容 re-export。
- 时间驱动状态改变受击/翻滚表现：手动 QA 轻/重受击、翻滚、交互、倒地起身。
- 生成数据 stale：fingerprint 测试失败即提示重新运行 `pnpm bake:support-hands`。

## 7. 进度记录

- 2026-10-21：创建计划，开始 WP1。

- 2026-10-21：WP0–WP6 完成；攻击数据拆分为 `attack_clips/`，支撑手离线烘焙，人形分包搬家，状态注册表与生物时长统一；`pnpm test` / `pnpm test:e2e` / `pnpm build` 通过。剩余：gizmo 投影计算、Canvas 桩集中、目标测试 `as unknown as` 清理。

## 8. 验收结果

- pnpm type-check 通过。
- pnpm test 通过（155 文件 / 1476 用例）。
- pnpm test:e2e 通过（70 用例）。
- pnpm build 通过（仅 Vite chunk size 警告）。
- pnpm bake:support-hands 可重新生成基础状态 10 × 14 与 36 个双手段支撑手数据。
- 剩余：gizmo 投影计算、Canvas 桩集中、目标测试 s unknown as 清理（不影响生产）。
