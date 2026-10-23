# 体形计划（entity/character/body_form/）模块约定

## 约定

- **BodyForm** 是「一个体形」的注册与选择单位：一组**体形专属工厂**（骨架 / 外观装配 / 动画系统 / 碰撞布局 / 受击子块 / 尺寸与 HP / 装备槽 / 武器策略）的聚合。新增体形 = 新增一份 plan + 一个 `body_form/<form>/` 分包。
- plan 位于**实体层**（组合外观装配器、骨架预设、动画系统与受击块）；纯领域数据（受击块类型 `character/hurt_blocks.ts`、武器、护甲）仍在 `character/`。
- 注册表 `BODY_FORMS`（`index.ts`）；`bodyFormOf(id)` 对未知 / 缺省 id **安全回退人形**（存档容错）。`isKnownBodyFormId` 供校验。
- `CharacterConfig.bodyFormId?`（缺省 = `humanoid`）是体形的持久化键；`CharacterConfig.bodyState?` 是不透明体形状态（人形解释 `holdMode` / `handedness`）。
- 装备状态 `EquipmentState` 嵌套 `limb` / `weapon` / `armor`，槽位键 = `kind:bodyPart`；`BodyForm.equipSlots: readonly EquipSlotDef[]` 声明该体形可用槽位与挂载骨骼节点。装备只影响数值与外观，不修改 skeleton / 关节 / 动画。

## per-form 分包（红线）

不同体形（人 / 狼 / 马 / 双足飞龙 wyvern）的骨骼、步态、动作、受击分区、AI 行为条目差异极大：
- 体形专有的骨架 / 外观 / `base_clips.ts` / `pose_fns.ts` / 动画系统一律落在 `body_form/<form>/`，**各自独立实现**；
- **禁止**用 `jointRefs` / `clipProvider` 之类的参数化把不同体形塞进人形动画代码；
- 世界主循环只消费 `BodyForm.createAnimation(...)` 返回的 `AppearanceSystem`（`update`），不 import 任何 `body_form/<form>/` 内部实现。

> 顶层 `appearance/` 仅保留跨体形共用工具（`mesh_builder` / `weapon_mesh` / `weapon_trail` / `skeleton_bridge` / 共享类型与常量）；人形专有实现已全部位于 `body_form/humanoid/`。

## 已注册体形（`body_form/<form>/` 分包）

- **humanoid**（`body_form/humanoid/`）：自包含骨架 / 受击块 / 模型 / 装配 / 姿态 / 动画系统 / 基础与攻击 clip / 支撑手烘焙 / 护甲与肢体网格；`createModel` 经 `createHumanoidModel`，`createAnimation = createAppearanceSystem`，`defaultWeaponId = 'unarmed'`。见 [`humanoid.md`](humanoid/humanoid.md)。
- **wolf**（`body_form/wolf/`）：四足；自包含骨架（`joints` + `bones` 层级段）/ 外观 / `pose_fns.ts` / `clips.ts`；口含短剑/长剑横向咬持；撕咬轻 1–2、口含剑轻 1–3，重击均为单段蓄力。
- **horse**（`body_form/horse/`）：四足高腿长颈；骨架同样包含完整关节 + 骨骼段；唯一武器 `horse_iron_hoof`（铁蹄），轻 1 前踢 / 轻 2 后踹 / 重击蓄力践踏；长枪与飞斧已移除。
- **wyvern**（`body_form/wyvern/`）：**双足飞龙（双足 + 双翼，共 4 肢）**；骨架含关节 + 骨骼段（翼主链 / 尾 / 后足 / 颈头）；固定天然 `claw`（melee，五段爪击）；重击来自独立 **`breath` 装备槽**（火球 / 雷电 / 激光三件物品，仅 wyvern 可装备）。

### 通用生物运行时（`body_form/common/creature_runtime/`）

狼 / 马 / wyvern 共用的**非人形**通用工具（非参数化人形代码）：
- `model.ts`：`createCreatureModel` / `createCreatureAppearance`（**低多面体部件**：`CreaturePartSpec` 为形状判别联合 `box`/`frustum`/`tube`/`ellipsoid`/`cone`/`sphere`/`fan`/`wing_membrane`，材质取自统一材质库 `render/character_materials.ts`；经 `mesh_builder` 挂到骨架关节组，支持武器位 + 碰撞可视化 + `alignYTo` 沿骨骼段定向；`wing_membrane` 由翼根 / 翼肘 / 翼腕 / 翼指关节逐帧驱动顶点，暴露 `updateDeform`）；
- `animation.ts`：`createCreatureAnimationSystem(clipProvider)`（状态 / 段 → clip 播放，攻击态首帧关命中窗口；状态 / 段切换按 `STATE_BLEND_DURATION` 做姿态混合消除突跳，行走 / 游泳按 `walkSpeedScale(horizontalSpeed)` 同步步频；播放后调用 `model.updateDeform()` 重建翅膜等骨骼驱动部件）；
- `pose.ts`：`bakePoseClip`（逐帧欧拉角 / 带位置姿态 → clip）。
各体形分包只提供自己的骨架、部件、`pose_fns`、`clips` 数据。

## BodyForm 字段（types.ts）

`id` / `nameKey` / `buildSkeleton` / `jointNameKeys?` / `assemble` / `palette?` / `createModel` / `createAnimation` / `colliderLayout` / `centerOffsetY` / `eyeHeight` / `size` / `baseHealth?` / `hurtProfile` / `equipSlots` / `weapons` / `defaultWeaponId` / `editor` / `breathModules?` / `rollSpinTurns?` / `onFrame?`。

- `eyeHeight`：眼部高度（脚底原点起算，scale=1）；AI 视线扇形 / 瞄准目标点一律经 `body_form/geometry.ts` 的 `formEyeHeight` 读取，不再写死人形常量。
- `weapons`：该体形**拥有**的全部武器（`WeaponConfig[]`，见「武器按体形分包」）。
- `breathModules`：体形专属吐息模组（仅 wyvern）；不进入主武器下拉，由 `weapon:breath` 槽装备。
- `editor`：骨骼编辑器能力声明（`weaponControl` / `handedness`），编辑器不再按体形 id 硬编码。

## 武器按体形分包

每个武器**只属于一种体形**（`WeaponModelConfig.formId`），数据声明在 `body_form/<form>/equipment/weapons.ts`，只复用 `appearance/weapon_mesh.ts` 的网格生成器（不同体形即使外观相同也各有一份独立条目）。`body_form/index.ts` 装配 `BODY_FORMS` 时经 `catalog.ts` 的 `registerFormWeapons(form.id, form.weapons)` 注册；`weaponSelectableFor(form, weapon)` = `weapon.formId === form.id`；面板武器下拉列 `weaponsOfForm(form.id)`。**切体形一律落到新体形 `defaultWeaponId`**（不跨体形沿用武器）。存档武器 id 与体形不符时由 `world.spawnEntity` 回退该体形默认武器。

生物天然武器可经 `mountJointId` 指定专属挂点关节（马 `horse_iron_hoof` → 默认前蹄、飞龙 `wyvern_claw` → 右翼腕 `wingRWrist`），由 `createCreatureModel.equipWeapon` 重定向挂点；多肢体攻击段再用 `AttackSegment.hitMountJointIds` 分别指定左右翼爪 / 口 / 尾 / 四蹄。吐息模组通过独立 `breath` 装备槽装备，装备后与龙爪组合成「轻击爪链 + 重击吐息链」。

## 运行时切换（world.setBodyForm）

`world.setBodyForm(id, planId)`：未知 id 或同一体形返回 `false`；否则依次——
重设 `config.bodyFormId`（humanoid 用缺省表示）→ 武器策略（**一律落新体形 `defaultWeaponId`**）→ 装备过滤（`filterEquipmentState(plan.equipSlots, equipment)`）→ dispose 旧模型并按新 plan 重建（`plan.createModel`）→ **动画系统按新 plan 重建**（`appearanceSystems.set(id, plan.createAnimation({onAttackEvent}))`；每帧 `sys.update(dt, model, …)` 用当前模型，不重建则切体形后仍由旧体形动作数据驱动 → 关节不匹配而冻结）→ 生命值档位 → 受击子块与碰撞体按新 `colliderLayout` 重建 → 重新装配武器 / 护甲 / 肢体 / 持握 / 阵营色 + 重绑材质效果 → 按 `centerOffsetY` 重定位（脚底不动）。面板「基础模组」选择器（`#body-form-select`）调用它，并按 `equipSlots` 隐藏不适用装备区域。

## 与既有系统接线

- `body_form/humanoid/model.ts` 的 `createCharacterModel(config, faction, plan)` 必须显式接收体形 plan；`createHumanoidModel(config, faction)` 是固定人形的便捷入口。
- `physics/world.ts`：
  - `originToCenterY(config)` 读 `bodyFormOf(config.bodyFormId).centerOffsetY`。
  - `spawnEntity` 按 `plan.colliderLayout` 建碰撞体（首个 = `mainCollider`；全部存 `entity.colliders`）；`hurtProfile` 取 `plan.hurtProfile`；动画系统取 `plan.createAnimation({onAttackEvent})`。
  - `updateCharacterConfig` 改 scale 时按 `colliderLayout` 重建；`syncCollidersFromNodes` 遍历 `colliderLayout` 用节点相对根变换驱动。**提交武器 / 装备时按当前体形 fail-closed 过滤**：武器经 `weaponSelectableFor`（= `weapon.formId === form.id`）剔除不属于该体形的项、装备经 `filterEquipmentState(plan.equipSlots, …)` 剔除无槽项——面板 Apply 会先 `setBodyForm` 再 `updateCharacterConfig`，若不过滤则会把「切换体形前」的旧选择重新装回（绕过 `setBodyForm` 的回退）。
  - `maxHP = plan.baseHealth ?? (近战 15 / 远程 8)`。
- `CharacterEntity.colliders: RAPIER.Collider[]`（`mainCollider = colliders[0]`）；原 `upperCollider` 字段已被之取代。

## 陷阱

- 非人形 plan 的骨架必须自带上/下（或等价）碰撞节点，否则 `syncCollidersFromNodes` 跳过、碰撞体停留在静态初始位置。
- **生物受击块走显式 `hurtProfile.shape`**：生物低多面体部件不注册 `jointParts`（几何非盒，无法按 `geometry.parameters` 对齐），`refreshHurtBlocks` 无部件时回退「关节矩阵 + `shape` 常量」，故非人形务必给出合理 `shape.half` + `offsetLocal`（已随 `config.scale` 正确缩放）。
- 外观装配器返回 `colliderMeshes`（edit / bone_edit 可视化）。
- 受击子块检定（`refreshHurtBlocks`）无部件时回退关节矩阵 + `shape` 常量，非人形务必给出合理 `shape.half`。
- **生物攻击姿态 / clip 缓存必须按段 `id` 判别**：狼撕咬与口含剑、马前踢/后踹/践踏、龙五段爪击与吐息各自使用独立 clip；按 `key` 分支会串味、按 `key` 缓存会互相覆盖。狼/马/龙均以 `segment.id` 作缓存键，吐息段用 `segment.attackWeaponId` 区分武器来源。
