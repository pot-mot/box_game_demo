# 外观共享工具（entity/character/appearance/）

> 状态：当前实现。
> 人形骨架 / 模型 / 动作 / 支撑手见 [`forms/humanoid/humanoid.md`](../forms/humanoid/humanoid.md)。
> 体形注册与运行时切换见 [`body_form.md`](../body_form/body_form.md)。

## 约定

本目录只保留**跨体形共享**的外观工具，不包含人形专有实现。

- `types.ts`：`CreatureModel` / `AnimationContext` / `WeaponEquipConfig` / `AppearanceSystem` / `CharacterColorPalette`。
- `constants.ts`：阵营调色板 / `factionColorOf` / `SELECT_PALETTE` / `walkSpeedScale` / `STATE_BLEND_DURATION` / `WEAPON_GRIP_FLEX` / `PRESET_PALETTE` / 格挡与死亡姿态时长等共享常量。
- `mesh_builder.ts`：程序化几何/材质工厂（`box` / `cylinder` / `sphere` / `cone` / `frustum` / `capsule` / `ellipsoid` / `tube` / `fan`），统一登记并在 `dispose` 释放。
- `weapon_mesh.ts`：全部武器网格生成器 + 固有握持表 `WEAPON_MESH_GRIPS` + 本地命中箱；`WeaponMeshConfig.supportGripOffset` 声明双手副握距。
- `weapon_trail.ts`：刀光拖尾。
- `skeleton_bridge.ts`：场景 Group 与领域骨架桥接（人形 / 生物共用）。

## 渲染模型契约

`CreatureModel` 是世界主循环 / 近战执行器 / 动画系统唯一依赖的模型门面：

- `group` / `jointGroups` / `jointParts` / `colliderMeshes`
- `equipWeapon` / `setOffhandStowed` / `setHandedness` / `removeWeapon`
- `equipArmor` / `equipLimbs`（无该能力的体形为空操作）
- `weaponGroup` / `weaponHitBox` / `weaponSupportGripOffset` / `offhandWeaponGroup`
- `updateDeform?` / `recolor` / `dispose`

人形专属关节 getter 在 `forms/humanoid/types.ts` 的 `CharacterModel`。

## 武器网格

- 每个武器模型是独立参数化 `gen` 函数，派发表只做 id → gen 映射；新增/修改外观只改对应 gen。
- 握持（握把对齐模型原点 + 固有前倾/刃面）在 `createWeaponMesh` 内烘焙，运行时无外部握持节点。
- 命中箱由各 gen 显式声明（`WeaponLocalHitBox`），`reach = center.y + half.y − gripY`。
- `supportGripOffset` 由武器数据声明（`forms/<form>/weapons.ts`），不再按武器 id 写 `switch`。

## 陷阱

- 武器/护甲/肢体网格的左右镜像由模型槽位统一 `scale.x = -1`，`gen` 内不得写死左右。
- 非对称网格仅左撇子镜像；右撇子副手不缩放。
- 共享层禁止 import `forms/humanoid/` 或任何具体体形实现。
- 材质与 CanvasTexture 必须经 builder 登记，随 `dispose` 释放。
