# 体形计划（entity/character/body_form/）模块约定

## 约定

- **BodyForm** 是「一个体形」的注册与选择单位：一个体形的 **状态 / 骨架 / 外观 / 动画 / 装备** 五类资源的聚合。
  新增体形 = 新增一份 plan + 一个 `body_form/<form>/` 分包。
- **单一真源**：
  - `BodyForm.state`（`state/form_state.ts`）：基础属性、尺寸、中心偏移、眼高、基础移速 / 韧性、状态时长基线。
    最终数值统一经 `common/state.ts` 的 `resolveBodyFormState(...)` 计算（基础 + 装备）。
  - `BodyForm.skeleton`（`skeleton/`）：关节层级、骨骼段、**碰撞布局**、**受击子块**的唯一来源。
    碰撞箱 / 受击箱只读取骨架节点与骨架数据，**禁止**读取 appearance 部件几何。
  - `BodyForm.assemble` / `createModel`（`appearance/`）：网格、材质、装备外观；只消费骨架派生数据。
  - `BodyForm.createAnimation`（`skeleton_animation/`）：动画模组、组合与 clip 播放；不能增删骨骼节点。
  - `BodyForm.equipSlots` + `equipmentModules`（`state/` + `equipment/`）：槽位与装备模组。
    同一模组共享槽位的 `mountJointIds`（骨骼挂载配置），单件只声明数值与外观。
- 注册表 `BODY_FORMS`（`index.ts`）；`bodyFormOf(id)` 对未知 / 缺省 id **安全回退人形**（存档容错）。
  `isKnownBodyFormId` 供校验。装配时会校验装备模组与槽位表一致，不一致直接 fail loudly。
- `CharacterConfig.bodyFormId?`（缺省 = `humanoid`）是体形的持久化键；
  `CharacterConfig.bodyState?` 是不透明体形状态（人形解释 `holdMode` / `handedness`）。
- 装备状态 `EquipmentState` 嵌套 `limb` / `weapon` / `armor`，槽位键 = `kind:bodyPart`。
  **装备只影响数值与外观，不修改 skeleton / 关节 / 动画**；武器额外拥有攻击动画模组，属于领域允许项。

## per-form 分包（红线）

不同体形（人 / 狼 / 马 / 双足飞龙 wyvern）的骨骼、步态、动作、受击分区、AI 行为条目差异极大：

- 体形专有的骨架 / 外观 / `form_state.ts` / `equip_slots.ts` / `equipment/` / `base_clips.ts` / `pose_fns.ts` / 动画系统
  一律落在 `body_form/<form>/`，**各自独立实现**；
- **禁止**用 `jointRefs` / `clipProvider` 之类的参数化把不同体形塞进人形动画代码；
- 世界主循环只消费 `BodyForm.createAnimation(...)` 返回的 `AppearanceSystem`（`update`）与 `createModel`，
  不 import 任何 `body_form/<form>/` 内部实现。

> 顶层 `appearance/` 仅保留跨体形共用工具（`mesh_builder` / `weapon_mesh` / `weapon_trail` / `skeleton_bridge` / 共享类型与常量）。

## 已注册体形

- **humanoid**（`body_form/humanoid/`）：自包含状态 / 骨架 / 受击块 / 模型 / 装配 / 姿态 / 动画系统 /
  基础与攻击 clip / 支撑手烘焙 / 护甲与肢体网格 / 武器与装备模组。
  `createModel` 经 `createHumanoidModel`，`createAnimation = createAppearanceSystem`，`defaultWeaponId = 'unarmed'`。
  人形护甲 / 肢体预设数据位于 `humanoid/equipment/armor.ts` / `limb.ts`，由 `body_form/index.ts` 在装配时经 `character/armor/catalog.ts` 注册；`equipment/modules.ts` 负责按槽位批量生成装备模组。
- **wolf**（`body_form/wolf/`）：四足；自包含骨架（`joints` + `bones` 层级段）/ 状态 / 外观 / `pose_fns.ts` / `clips.ts`；
  口含短剑 / 长剑横向咬持；撕咬轻 1–2、口含剑轻 1–3，重击均为单段蓄力。
- **horse**（`body_form/horse/`）：四足高腿长颈；骨架包含完整关节 + 骨骼段；
  默认武器 `horse_iron_hoof`（铁蹄），轻 1 前踢 / 轻 2 后踹 / 重击蓄力践踏。
- **wyvern**（`body_form/wyvern/`）：双足飞龙（双足 + 双翼，共 4 肢）；骨架含关节 + 骨骼段（翼主链 / 尾 / 后足 / 颈头）；
  固定天然 `wyvern_claw`（五段爪击）；重击来自独立 `breath` 装备槽（火球 / 雷电 / 激光）。

## 通用生物运行时（`body_form/common/creature_runtime/`）

狼 / 马 / wyvern 共用的**非人形**通用工具（非参数化人形代码）：

- `model.ts`：`createCreatureModel` / `createCreatureAppearance`（低多面体部件；材质取自统一材质库；
  经 `mesh_builder` 挂到骨架关节组；支持武器位 + 碰撞可视化 + `alignYTo` 沿骨骼段定向）；
  装备外观由 `spec.equipmentAppearance` 注入（各体形 `appearance/equipment.ts` 构建真实网格），
  模型只负责生命周期与换装，不再生成统一占位色块。
- `animation.ts`：`createCreatureAnimationSystem(provider)`（状态 / 段 → clip 播放；状态 / 段切换姿态混合；
  行走 / 游泳按 `walkSpeedScale(horizontalSpeed)` 同步步频；播放后调用 `model.updateDeform()`；
  动画只采样预烘焙 clip 并写入骨架，**不执行运行时 IK**）。
- `state.ts`：`BodyFormStateDefinition` / `resolveBodyFormState`（基础属性 + 装备 → 最终数值）。
- `equipment.ts`：生物装备外观公共装配器（体形提供尺寸 / 材质风格）。
- `pose.ts`：`bakePoseClip`（逐帧欧拉角 / 带位置姿态 → clip）。
- `skeleton_animation/`：`composition.ts`（动画组合 / 单关节权重 / 模组烘焙）、`factory.ts`（姿态动画工厂）。

各体形分包只提供自己的骨架、状态、部件、`pose_fns`、`clips`、装备模块与外观风格。

## BodyForm 字段（`common/types.ts`）

`id` / `nameKey` / `state` / `skeleton` / `assemble` / `palette?` / `createModel` / `createAnimation` /
`equipSlots` / `equipmentModules` / `armorPieces?` / `limbPieces?` / `weapons` / `defaultWeaponId` /
`editor` / `breathModules?` / `rollSpinTurns?` / `onFrame?`。

- `state`：`size` / `centerOffsetY` / `eyeHeight` / `baseHealth` / `baseDefense` / `baseAttack` /
  `baseMoveSpeedMultiplier` / `basePoise` / `animation`。读取尺寸 / 眼高一律走 `state`（或 `common/geometry.ts` 派生函数）。
- `skeleton`：`build` / `jointNameKeys?` / `colliderLayout` / `hurtProfile`。
- `equipmentModules`：由槽位 + 单件装备批量化生成；模块 `mountJointIds` 必须与槽位一致。
- `weapons`：该体形拥有的全部武器；`weaponSelectableFor(form, weapon) = weapon.formId === form.id`。
- `breathModules`：体形专属吐息模组（仅 wyvern）；不进入主武器下拉，由 `weapon:breath` 槽装备。
- `editor`：骨骼编辑器能力声明（`weaponControl` / `handedness`），编辑器不按体形 id 硬编码。

## 装备槽与模组

- 槽位表由各体形 `state/equip_slots.ts` 声明；槽位是游戏层限制，不要求与特定骨骼节点一一对应。
- 装备模组由 `common/equipment.ts` 的 `buildEquipmentModules` 从槽位 + 单件装备生成：
  同模组全部装备共享 `mountJointIds`；`validateEquipmentModules` 在 `body_form/index.ts` 装配期校验。
- 当前槽位覆盖：
  - 飞龙 limb：`wing_claw / wing / head / torso / legs / tail`；weapon：`wing_claw / breath`；
    armor：`head / torso / legs / wing / tail`。
  - 马 limb：`head / torso / legs / tail`；weapon：`hooves / head`；armor：`hooves / head / torso / legs`。
  - 狼 limb：`claw / head / torso / legs / tail`；weapon：`claw / head`；armor：`claw / head / torso / legs`。
- 每个槽位至少有一件可装备物品（缺失会由 `contracts.test.ts` 的模组校验发现）。

## 武器按体形分包

每个武器**只属于一种体形**（`WeaponModelConfig.formId`），数据声明在 `body_form/<form>/equipment/weapons.ts`，
只复用 `appearance/weapon_mesh.ts` 的网格生成器。`body_form/index.ts` 装配 `BODY_FORMS` 时经
`registerFormWeapons(form.id, form.weapons)` 注册。**切体形一律落到新体形 `defaultWeaponId`**。

生物天然武器可经 `mountJointId` 指定专属挂点关节；多肢体攻击段用 `AttackSegment.hitMountJointIds` 分别指定。
吐息模组通过独立 `breath` 装备槽装备。

## 运行时切换（world.setBodyForm）

`world.setBodyForm(id, planId)`：未知 id 或同一体形返回 `false`；否则依次——

1. 重设 `config.bodyFormId`（humanoid 用缺省表示）；
2. 武器策略落到新体形 `defaultWeaponId`，装备按 `filterEquipmentState(plan.equipSlots, …)` 过滤；
3. 状态基线（防御 / 攻击 / 移速 / 韧性 / 生命）从 `plan.state` 重建最终数值；
4. dispose 旧模型并按新 plan 重建（`plan.createModel`），动画系统按新 plan 重建；
5. 受击子块与碰撞体按新 `skeleton.hurtProfile` / `skeleton.colliderLayout` 重建；
6. 重新装配武器 / 护甲 / 肢体 / 持握 / 阵营色 + 重绑材质效果；
7. 按 `plan.state.centerOffsetY` 重定位（脚底不动）。

## 与既有系统接线

- `body_form/humanoid/appearance/model.ts` 的 `createCharacterModel(config, faction, plan)` 必须显式接收体形 plan。
- `physics/world.ts`：
  - `originToCenterY(config)` 读 `bodyFormOf(config.bodyFormId).state.centerOffsetY`。
  - `spawnEntity` 按 `plan.skeleton.colliderLayout` 建碰撞体（首个 = `mainCollider`；全部存 `entity.colliders`）；
    `hurtProfile` 取 `plan.skeleton.hurtProfile`；最终数值走 `resolveBodyFormState`。
  - `refreshHurtBlocks` 只按 `profile` + 关节矩阵世界化，不读取 `model.jointParts` 几何。
  - `syncCollidersFromNodes` 遍历 `plan.skeleton.colliderLayout` 用节点相对根变换驱动。
- `CharacterEntity.colliders: RAPIER.Collider[]`（`mainCollider = colliders[0]`）。

## 陷阱

- 非人形 plan 的骨架必须自带上/下（或等价）碰撞节点，否则 `syncCollidersFromNodes` 跳过、碰撞体停留在静态初始位置。
- **受击块只由骨架数据声明**：`shape.half` + `offsetLocal` 必须随 `config.scale` 正确缩放；
  禁止再从外观部件读取尺寸（否则外观会反向影响判定）。
- 外观装配器返回 `colliderMeshes`（edit / bone_edit 可视化）。
- **生物攻击姿态 / clip 缓存必须按段 `id` 判别**：狼撕咬与口含剑、马前踢/后踹/践踏、龙五段爪击与吐息各自使用独立 clip。
