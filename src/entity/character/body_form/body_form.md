# 体形计划（entity/character/body_form/）模块约定

> 设计文档见 [`docs/design/body_form.md`](../../../../docs/design/body_form.md)。

## 约定

- **BodyForm** 是「一个体形」的注册与选择单位：一组**体形专属工厂**（骨架 / 外观装配 / 动画系统 / 碰撞布局 / 受击子块 / 尺寸与 HP / 装备槽 / 武器策略）的聚合。新增体形 = 新增一份 plan + 一个 `forms/<form>/` 分包。
- plan 位于**实体层**（组合外观装配器、骨架预设、动画系统与受击块）；纯领域数据（受击块类型 `character/hurt_blocks.ts`、武器、护甲）仍在 `character/`。
- 注册表 `BODY_FORMS`（`index.ts`）；`bodyFormOf(id)` 对未知 / 缺省 id **安全回退人形**（存档容错）。`isKnownBodyFormId` 供校验。
- `CharacterConfig.bodyFormId?`（缺省 = `humanoid`）是体形的持久化键。

## per-form 分包（红线）

不同体形（人 / 狼 / 马 / 双足飞龙 wyvern）的骨骼、步态、动作、受击分区、AI 行为条目差异极大：
- 体形专有的骨架 / 外观 / `base_clips.ts` / `pose_fns.ts` / 动画系统一律落在 `forms/<form>/`，**各自独立实现**；
- **禁止**用 `jointRefs` / `clipProvider` 之类的参数化把不同体形塞进人形动画代码；
- 世界主循环只消费 `BodyForm.createAnimation(...)` 返回的 `AppearanceSystem`（`onStateChange` / `update`），不 import 任何 `forms/<form>/` 内部实现。

> 顶层 `appearance/` 仅保留跨体形共用工具（`mesh_builder` / `weapon_mesh` / `skeleton_bridge` 的通用能力等）；人形专有实现将收敛进 `forms/humanoid/`（见设计文档 W3.5）。

## 已注册体形（`forms/<form>/` 分包）

- **humanoid**（`forms/humanoid/body_form.ts`）：字段与既有常量逐一对应（行为不变）；`createModel = createCharacterModel`、`createAnimation = createAppearanceSystem`；`defaultWeaponId = 'unarmed'`。
- **wolf**（`forms/wolf/`）：四足；自包含骨架 / 外观 / `pose_fns.ts` / `clips.ts`；口部挂点（口含短剑·长剑），天然 `bite` 为 default。
- **horse**（`forms/horse/`）：四足高腿长颈；天然 `kick` 为 default + 长枪 / 飞斧。
- **wyvern**（`forms/wyvern/`）：**双足飞龙（双足 + 双翼，共 4 肢）**；天然 `claw`（melee）/ `breath`（ranged）。（dragon 六肢西方龙不在本期。）

### 通用生物运行时（`forms/creature_runtime/`）

狼 / 马 / wyvern 共用的**非人形**通用工具（非参数化人形代码）：
- `model.ts`：`createCreatureModel` / `createCreatureAppearance`（**低多面体部件**：`CreaturePartSpec` 为形状判别联合 `box`/`frustum`/`cylinder`/`cone`/`sphere`/`fan`，材质取自统一材质库 `render/character_materials.ts`；经 `mesh_builder` 挂到骨架关节组，支持武器位 + 碰撞可视化 + `alignYTo` 沿骨骼段定向）；
- `animation.ts`：`createCreatureAnimationSystem(clipProvider)`（状态 / 段 → clip 播放，攻击态首帧关命中窗口）；
- `pose.ts`：`bakePoseClip`（逐帧欧拉角 → clip）。
各体形分包只提供自己的骨架、部件、`pose_fns`、`clips` 数据。

## BodyForm 字段（types.ts）

`id` / `nameKey` / `buildSkeleton` / `jointNameKeys?` / `assemble` / `palette?` / `createModel` / `createAnimation` / `colliderLayout` / `centerOffsetY` / `eyeHeight` / `size` / `baseHealth?` / `hurtProfile` / `equipSlots` / `weapons` / `defaultWeaponId` / `rollSpinTurns?` / `onFrame?`。

- `eyeHeight`：眼部高度（脚底原点起算，scale=1）；AI 视线扇形 / 瞄准目标点一律经 `body_form/geometry.ts` 的 `formEyeHeight` 读取，不再写死人形常量。
- `weapons`：该体形**拥有**的全部武器（`WeaponConfig[]`，见「武器按体形分包」）。

## 武器按体形分包

每个武器**只属于一种体形**（`WeaponModelConfig.formId`），数据声明在 `forms/<form>/weapons.ts`，只复用 `appearance/weapon_mesh.ts` 的网格生成器（不同体形即使外观相同也各有一份独立条目）。`body_form/index.ts` 装配 `BODY_FORMS` 时经 `catalog.ts` 的 `registerFormWeapons(form.id, form.weapons)` 注册；`weaponSelectableFor(form, weapon)` = `weapon.formId === form.id`；面板武器下拉列 `weaponsOfForm(form.id)`。**切体形一律落到新体形 `defaultWeaponId`**（不跨体形沿用武器）。存档武器 id 与体形不符时由 `world.spawnEntity` 回退该体形默认武器。

生物天然武器可经 `mountJointId` 指定专属挂点关节（如马 `horse_kick` → `kickMount`、飞龙 `wyvern_claw` → `clawMount`），由 `createCreatureModel.equipWeapon` 重定向挂点。

## 运行时切换（world.setBodyForm）

`world.setBodyForm(id, planId)`：未知 id 或同一体形返回 `false`；否则依次——
重设 `config.bodyFormId`（humanoid 用缺省表示）→ 武器策略（**一律落新体形 `defaultWeaponId`**）→ 装备过滤（`filterEquipLoadouts(plan.equipSlots, armor, limb)`）→ dispose 旧模型并按新 plan 重建（`createCharacterModel`）→ **动画系统按新 plan 重建**（`appearanceSystems.set(id, plan.createAnimation({onAttackEvent}))`；每帧 `sys.update(dt, model, …)` 用当前模型，不重建则切体形后仍由旧体形动作数据驱动 → 关节不匹配而冻结）→ 生命值档位 → 受击子块与碰撞体按新 `colliderLayout` 重建 → 重新装配武器 / 护甲 / 肢体 / 持握 / 阵营色 + 重绑材质效果 → 按 `centerOffsetY` 重定位（脚底不动）。面板「基础模组」选择器（`#body-form-select`）调用它，并按 `equipSlots` 隐藏不适用装备区域。

## 与既有系统接线

- `appearance/model.ts` 的 `createCharacterModel(config, faction, plan?)` 由 plan 提供骨架与外观装配；缺省取 `bodyFormOf(config.bodyFormId)`。
- `physics/world.ts`：
  - `originToCenterY(config)` 读 `bodyFormOf(config.bodyFormId).centerOffsetY`。
  - `spawnEntity` 按 `plan.colliderLayout` 建碰撞体（首个 = `mainCollider`；全部存 `entity.colliders`）；`hurtProfile` 取 `plan.hurtProfile`；动画系统取 `plan.createAnimation({onAttackEvent})`。
  - `updateCharacterConfig` 改 scale 时按 `colliderLayout` 重建；`syncCollidersFromNodes` 遍历 `colliderLayout` 用节点相对根变换驱动。**提交武器 / 装备时按当前体形 fail-closed 过滤**：武器经 `weaponSelectableFor`（= `weapon.formId === form.id`）剔除不属于该体形的项、装备经 `filterEquipLoadouts(plan.equipSlots, …)` 剔除无槽项——面板 Apply 会先 `setBodyForm` 再 `updateCharacterConfig`，若不过滤则会把「切换体形前」的旧选择重新装回（绕过 `setBodyForm` 的回退）。
  - `maxHP = plan.baseHealth ?? (近战 15 / 远程 8)`。
- `CharacterEntity.colliders: RAPIER.Collider[]`（`mainCollider = colliders[0]`）；原 `upperCollider` 字段已被之取代。

## 陷阱

- 非人形 plan 的骨架必须自带上/下（或等价）碰撞节点，否则 `syncCollidersFromNodes` 跳过、碰撞体停留在静态初始位置。
- **生物受击块走显式 `hurtProfile.shape`**：生物低多面体部件不注册 `jointParts`（几何非盒，无法按 `geometry.parameters` 对齐），`refreshHurtBlocks` 无部件时回退「关节矩阵 + `shape` 常量」，故非人形务必给出合理 `shape.half` + `offsetLocal`（已随 `config.scale` 正确缩放）。
- 外观装配器返回 `colliderMeshes`（edit / bone_edit 可视化）。
- 受击子块检定（`refreshHurtBlocks`）无部件时回退关节矩阵 + `shape` 常量，非人形务必给出合理 `shape.half`。
- **生物有多种天然武器时，攻击姿态 / clip 缓存必须按段 `id` 而非 `key` 判别**：近战与远程段的 `key` 可能同为 `'light'`（如 wyvern 的 claw 与 breath），按 `key` 分支会串味（吐息用爪击姿态）、按 `key` 缓存会互相覆盖。背驰示例：`wyvernAttackPose(segment)` 用 `segment.id.startsWith('breath')` 区分、`wyvernAttackClip` 用 `segment.id` 作缓存键。
