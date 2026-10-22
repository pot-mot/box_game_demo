# 人形分包（forms/humanoid/）

> 状态：当前实现。
> 共享外观工具见 [`appearance.md`](../../appearance/appearance.md)；全局动作规范见 [`动作设计规范.md`](../../../../../docs/bone_animation/动作设计规范.md)。

## 约定

- **自包含**：骨架、受击块、模型、装配、姿态、动画系统、基础/攻击 clip、支撑手烘焙、护甲/肢体网格均在本目录。
- **模型工厂**：`createCharacterModel(config, faction, plan)` 必须显式接收 `BodyForm`；`createHumanoidModel(config, faction)` 是固定人形体形的便捷入口。
- **骨架唯一源**：`skeleton.ts` 的 `buildCharacterSkeletonDefinition()`；`preset.ts` / 旧 `appearance/model.ts` 均不再存在。
- **动作分层**：基础状态由 `pose_fns.ts` 公式 → `base_clips.ts` 烘焙；攻击段由 `character/weapon/attack_clips/` 作者数据 → `attack_clip_build.ts` 编译；`attack_clips.ts` 合并支撑手并镜像。
- **支撑手离线烘焙**：攻击与基础状态的左肩/左肘轨来自 `clips/generated/`；生成器 `scripts/bake_support_hands.mjs`，命令 `pnpm bake:support-hands`。生产运行时无 IK。
- **惯用手**：骨架与数据恒为 canonical 右撇子；左撇子由 `mirrorClip` + 挂点/网格镜像派生。

## 文件

| 文件 | 内容 |
|---|---|
| `skeleton.ts` | 人形骨架定义、关节显示名、`PRESET_PART_SIZES` |
| `hurt.ts` | 人形 12 受击子块 |
| `constants.ts` | 人形姿态 / 武器 / 盾 / 护甲常量 |
| `constants.ts` / `types.ts` | 人形常量与 `CharacterModel` |
| `model.ts` | 模型门面：骨架 Group + 武器/护甲/肢体装配 + 惯用手 |
| `assemble.ts` | 方块人身体部件装配 |
| `pose_fns.ts` | 基础状态姿态公式 |
| `clips/base_clips.ts` | 基础状态 clip 烘焙、缓存、支撑手合并 |
| `clips/attack_clips.ts` | 攻击作者数据编译、支撑手合并、镜像、缓存 |
| `clips/attack_clip_build.ts` | 作者格式 → `ClipJSON` |
| `clips/support_hand_merge.ts` | 支撑手双轨合并 |
| `clips/support_hand_bake.ts` | 离线烘焙算法（仅生成器/验证测试使用，生产不 import） |
| `clips/generated/` | 自动生成的支撑手数据（禁止手改） |
| `armor_mesh.ts` | 护甲 / 种族肢体网格 |
| `body_form.ts` | BodyForm 装配 + `createHumanoidModel` |
| `rig.ts` / `script_motions.ts` | 骨骼编辑器函数编排 |

## 惯用手与槽位

- 主手 = 解剖右 = `rightWeaponMount`，副手 = 解剖左 = `leftWeaponMount`（canonical）。
- `handedness='left'`：`mainSlot` / `offSlot` 互换，网格 `scale.x=-1`，clip 走 `mirrorClip`；不写左撇子专有数据。
- 手部关节 `*HandPivot` 与武器挂点 `*WeaponMount` 是不同关节；武器直接挂武器骨骼。

## 陷阱

- 肘 `rx <= 0`、膝 `rx >= 0`；禁止整条手臂/腿取反。
- 倒地末帧 = 起身首帧（完全伏地），起身三段比例与 `states/get_up.ts` 共用常量。
- 盾面法线为武器本地 +Y；基础状态由 `orientShieldArms` 反解武器骨骼 X 转角，副手盾挂背额外 `SHIELD_STOW_TILT_X`。
- 护甲顶端不得与身体顶面共面，至少高出 `ARMOR_TOP_OVERLAP`；宽度不得小于身体。
- 肢体默认 replace，`LIMB_SLOT_HIDDEN_PARTS` 按槽位隐藏人类部位；护甲/肢体共用 `refreshHiddenBodyParts`。
- 未播放动画的静止姿态也要给武器骨骼 `WEAPON_GRIP_FLEX`，否则武器贴合前臂穿模。
