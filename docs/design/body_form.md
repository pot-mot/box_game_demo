# 体形计划（BodyForm）与体形分包设计

> 状态：已定稿（按 per-form 分包架构）。目标：让「角色」从人形硬编码扩展为可切换的**基础模组（BodyForm）**，
> 支持人形 / 四足（狼、马）/ 飞行（双足飞龙 wyvern）等体形，可运行时切换。

## 1. 背景与目标

现有系统的人形假设散落多处：骨架 `entity/character/skeleton/preset.ts`、外观 `entity/character/appearance/*`、
动画 `appearance/clips/base_clips.ts` + `pose_fns.ts` + `appearance/system.ts`、受击 `skeleton/hurt_blocks.ts`、
碰撞（`physics/world.ts` 的上下半竖直胶囊）、装备槽（`character/armor/slots.ts`、`inventory/types.ts`、面板）、
尺寸/HP（`CHARACTER_BASE_SIZE`、按 `weapon.type` 取 15/8）。

**核心原则（本设计的前提）**：不同基础模型（人 / 狼 / 马 / 双足飞龙 wyvern）的**骨骼、步态、动作、受击分区、AI 行为条目差异极大**。
因此动画 / 姿态 / 状态 / AI 这些**与体形强相关**的部分必须**按体形分包、各自独立实现**，
**禁止**用 `jointRefs` / `clipProvider` 之类的参数化把完全不同的模型塞进一套本来只针对人形骨骼的代码。

## 2. 术语

- **BodyForm（体形 / 基础模组）**：体形的注册与选择单位，是一组**体形专属工厂 + 体形策略**的聚合（见 §4）。
- **体形分包（form package）**：`forms/<form>/` 下的自包含模块，拥有该体形的骨架、外观、动画、状态、AI 接线（见 §3）。
- **AttackSourceKind**（`character/combat/world_targets.ts`）：`['melee','ranged','explosion','roll']`，**保持不变**，仅服务可破坏场景道具的来源过滤，与体形/武器类别解耦。
- **武器类别（weapon class）**：`character/weapon/` 的玩法数据单位；**空手 / 天然攻击也是武器类别**（见 §6）。
- **wyvern（双足飞龙）vs dragon（西方龙）** —— 严格区分：**wyvern = 双足 + 双翼（翼即前肢，共 4 肢，本次实现的飞行体形）**；**dragon = 四足 + 双翼（共六肢的西方龙，本期不实现）**。本设计中的飞行体形一律指 wyvern，代码 / 分包 / 文档命名使用 `wyvern`，**不得**用 `dragon` 指代双足飞龙。

## 3. 分包架构（per-form subpackages）

```text
src/entity/character/
├── body_form/                     # 公共选择层（不含任何体形专有实现）
│   ├── types.ts                   # BodyForm 契约
│   ├── index.ts                   # BODY_FORMS 注册表（humanoid/wolf/horse/wyvern）
│   ├── equip.ts                   # 按体形过滤装备（纯函数）
│   └── body_form.md
├── forms/
│   ├── humanoid/                  # 人形分包（自包含）
│   │   ├── skeleton.ts            # 骨架定义（原 skeleton/preset.ts）
│   │   ├── hurt_blocks.ts         # 受击子块清单
│   │   ├── appearance/            # 外观：部件装配 / 模型门面 / 护甲肢体网格
│   │   ├── clips/                 # 人形动画：base_clips.ts / pose_fns.ts
│   │   ├── animation_system.ts    # 人形 clip 调度（原 appearance/system.ts）
│   │   ├── states/                # 人形专属状态（若有）
│   │   ├── ai/                    # 人形专属 AI 条目（若有）
│   │   └── body_form.ts           # 组装为 BodyForm
│   ├── wolf/                      # 狼分包（同名文件，独立实现：四足步态 / 撕咬 / 口部挂点）
│   ├── horse/                     # 马分包（踢 / 刺 / 骑乘挂点）
│   └── wyvern/                    # 双足飞龙分包（双足 + 双翼 / 飞行 / 爪 / 吐息；dragon 为六肢西方龙，本期不实现）
```

**共享层（保持通用，不含体形假设）**：`skeleton/`（通用骨骼动画引擎：关节/IK/过渡/序列化）、
`character/combat/`、`character/weapon/`、`character/armor/`、`character/state_machine/`（框架）、`physics/`、
`input/`、`save_load/`、`i18n/`、`render/`。

**规则**：
1. 体形专有的骨架 / 外观 / clip / 姿态函数 / 动画系统一律落在 `forms/<form>/`，**不放入 `appearance/` 顶层**（顶层只保留跨体形共用的工具，如 `mesh_builder`、`weapon_mesh`、`skeleton_bridge` 的通用化能力）。
2. 每个体形分包自带 `clips/base_clips.ts` 与 `clips/pose_fns.ts`；人形的是现有实现，狼 / 马 / wyvern 各自新写。
3. `body_form/` 只做**选择与组合**，通过 `BodyForm` 暴露体形专属工厂；世界主循环只消费 `BodyForm` 契约，不 import 任何 `forms/<form>/` 内部实现。
4. 状态机与 AI 的**框架**共享；体形专属的状态（如 wyvern 的飞行 `flying`）与行为条目（如 wyvern 的俯冲）在对应分包内实现并注册。

## 4. BodyForm 契约（公共选择层）

`src/entity/character/body_form/types.ts`：

```ts
export interface BodyForm {
    readonly id: string
    readonly nameKey: StringLocaleKey

    // ── 骨架与外观 ──
    readonly buildSkeleton: () => SkeletonDefinition
    readonly jointNameKeys?: Readonly<Record<string, StringLocaleKey>>
    readonly assemble: (groups: ReadonlyMap<string, Group>, palette: BoxPartPalette) => BodyAppearance
    readonly palette?: BoxPartPalette            // 固定调色板（可选；体形固有配色）

    // ── 动画（体形专属分包实现） ──
    readonly createAnimation: (options: AppearanceSystemOptions) => AppearanceSystem

    // ── 物理与尺寸 ──
    readonly colliderLayout: readonly ColliderSpec[]
    readonly centerOffsetY: number
    readonly size: BodySize
    readonly baseHealth?: number

    // ── 受击 ──
    readonly hurtProfile: HurtBlockProfile

    // ── 装备与武器策略 ──
    readonly equipSlots: EquipSlotSet
    readonly defaultWeaponId: string
    readonly allowedWeapons?: readonly string[]

    // ── 体形专属每帧/状态/AI 挂接（可选） ──
    readonly onFrame?: (entity: CharacterEntity, model: CharacterModel) => void
}
```

- **不再有 `jointRefs` / `clipProvider`**：动画由 `createAnimation` 返回该体形自己的 `AppearanceSystem` 实现
  （人形 = `forms/humanoid/animation_system.ts`；狼 / 马 / wyvern = 各自实现）。世界只调用 `onStateChange` / `update`。
- 渲染模型门面 `CharacterModel` 的通用部分（`group` / `jointGroups` / `jointParts` / `colliderMeshes` /
  `weaponGroup` 等 / `equip*` / `recolor` / `dispose`）为跨体形所需；**人形专属关节 getter**（`spine` / `headNeck` /
  四肢等）仅人形分包使用，其他体形在其自身分包内定义自己的模型类型（不强制实现人形 getter）。

## 5. 受击子块 / 碰撞布局 / 尺寸

- 受击子块：沿用 `character/hurt_blocks.ts`（`HurtBlock` / `worldizeHurtBlock`）；每体形的 `hurtProfile` 按其语义分区
  （人形 12 块；狼=头/口/躯干/四肢；马=头/躯干/四肢；wyvern=头/颈/躯干/双翼/双足/尾）。
- 碰撞布局：`colliderLayout`（节点 → 形状列表）；人形 = 上下半竖直胶囊；四足 = 主竖胶囊（落地）+ 躯干横胶囊（+头/颈盒）；wyvern = 主竖胶囊（落地）+ 躯干盒（双足站立；双翼与尾部不参与物理）。
  `mainCollider` = 首个（地面/分离主引用），其余进 `entity.colliders[]`。
- 尺寸 / `centerOffsetY` / `baseHealth` 由 plan 提供。

## 6. 空手 / 天然攻击作为武器类别

- **不新增并行层**。武器目录扩展出「天然/空手」类别（`unarmed` / `bite` / `kick` / `claw` / `breath`…），
  与近战 / 远程同类对待，携带 `type`（`melee|ranged`）、`attacks`、数值。
- 投送分类 = `weapon.type`；执行器分发仍 `getSkillExecutor(weapon.type)`。
- **default 分配**：`BodyForm.defaultWeaponId`；无武器 / 无持械时落到它（人形 = 空手 `unarmed`）。
- wyvern 的爪（`claw`，melee，后足 / 翼爪）与吐息（`breath`，ranged，口部锥形喷射）是**两个天然类别**（按 `weapon.type` 单一投送）。
- 天然类别的**动画**（拳 / 咬 / 踢 / 爪 / 吐息）由所属体形分包的 `pose_fns` / `clips` 提供（段 `poses[].poseId` 指向该分包 clip）。

## 7. 装备槽体形化

- 槽位 id 扩为闭集合联合类型；`BodyForm.equipSlots` 声明该体形使用的子集；装备件按 `bodyForm` 归属过滤。
- 存档：`CharacterSaveConfig.bodyFormId?`（缺省 humanoid，旧档安全回退）；不兼容槽位安全丢弃（`filterEquipLoadouts`）。

## 8. 运行时切换

面板选「基础模组」→ `world.setBodyForm(id)`：重建骨架 / 外观（对应分包装配器）/ **动画系统（对应分包的 `createAnimation`）** /
碰撞布局 / 受击子块，重解析武器与装备，重设尺寸 / HP，脚底原点保持，面板按 `equipSlots` 隐藏不适用区域。

## 9. 分阶段实施与状态

- **W0** 本文档。✅ 已落地。
- **W1** 抽象基座：humanoid BodyForm + `world.ts` / `appearance/model.ts` 经 plan 取用（行为不变）。✅ 已落地。
- **W2** 武器目录泛化 + 空手类别（`none` 网格 + `unarmed` + `poseRef`）+ default 分配。✅ 已落地（人形空手可用；生物天然类别随体形分包在 W4-W6 落地）。
- **W3** 装备槽 / 武器策略体形化 + 运行时 `setBodyForm` + 存档 v16 + 面板选择器。✅ 已落地（以狼等体形验证切换；单测 + e2e 通过）。
- **W3.5 体形分包化**：`forms/<form>/` 分包结构落定；`BodyForm` 增 `createModel`（体形自带模型工厂）与 `createAnimation`（体形自带动画系统工厂）；世界经 plan 取模型 / 动画 / 碰撞 / 受击 / 装备，**不 import 任何 `forms/<form>/` 内部实现**；跨体形公共渲染契约抽为 `CreatureModel`（人形 `CharacterModel` 扩展之）。✅ 已落地。
  > 注：人形专属实现（骨架 / 外观 / `clips` / `animation_system`）仍位于 `appearance/` 与 `skeleton/`，由 `forms/humanoid/body_form.ts` 组装引用；生物分包 `forms/wolf|horse|wyvern/` 为自包含实现（各带 `skeleton.ts` / 外观 / `pose_fns.ts` / `clips.ts`）。
- **W4 狼分包** `forms/wolf/`：四足骨架 / 步态 / 受击 / 碰撞 / 口部挂点（口含短剑·长剑）+ 天然 `bite`（撕咬，melee）为 default；自带 `pose_fns.ts` / `clips.ts`（程序化烘焙）+ 通用 `createCreatureAnimationSystem`。✅ 已落地。
- **W5 马分包** `forms/horse/`：四足高腿长颈 + 天然 `kick`（踢击）为 default + 少量武器（长枪 / 飞斧）；自带动画。✅ 已落地。
- **W6 wyvern 分包** `forms/wyvern/`：**双足飞龙（双足 + 双翼，共 4 肢）** + 天然 `claw`（爪击，melee）/ `breath`（吐息，ranged）两类别；自带动画。✅ 已落地（**dragon = 四足双翼的六肢西方龙，不在本期范围**）。
- **W7** 玩家操控（共享状态机，随 `moveSpeedOf` 生效）+ 面板按体形选择与武器白名单过滤 + e2e。✅ 已落地；展示 / 骨骼动画两个**编辑器**仍按人形骨架构建（生物体形接入编辑器为后续工作）。
- **W8** 全量 `type-check` / `test` / `test:e2e` / `build` + 文档同步。✅ 已落地。
- **W9 低多面体美术**：统一角色材质库 `render/character_materials.ts` + 通用低多面体 builder（`mesh_builder` 的 `frustum` / `materialById` / flatShading / 指定父节点）落地；护甲 / 兜帽、狼 / 马 / wyvern、种族肢体（骷髅 / 兽人 / 精灵）、近战武器迁移为低多面体（生物用皮毛 / 鳞片 / 翅膜 / 爪 / 牙 / 角，装备用金属 / 皮革 / 布料 / 木料等命名材质）；生物碰撞体与受击块重排（受击走显式 `hurtProfile.shape`，不注册 `jointParts`）；近战命中箱随几何同步（保持范围序）。✅ 已落地。
- **W10 武器体形化 + 几何属性体形化 + 碰撞箱重构**：① 武器**只属于一种体形**（`WeaponModelConfig.formId`），数据下沉到 `forms/<form>/weapons.ts`（只复用 `weapon_mesh.ts` 网格生成器），`body_form/index.ts` 装配时经 `registerFormWeapons` 注册；人形 id 不变、生物用新 id（`wolf_bite` / `horse_kick` / `wyvern_claw` …）；切体形一律落新体形 `defaultWeaponId`；存档武器 id 与体形不符安全回退。② `BodyForm` 增 `eyeHeight`，AI / 导航 / 受击判定 / 分离一律经 `body_form/geometry.ts` 读体形属性（删除 `CHARACTER_BASE_SIZE` 在实体层的引用）。③ 生物碰撞布局改为「主竖直胶囊（落地）+ 横胶囊 / 悬空盒补形」（横胶囊由节点 90° 旋转实现），并修正马的攻击检测箱朝向、wyvern 段→姿势映射（按段 id 判别）、天然武器挂点（`mountJointId`）与命中盒。④ 翻滚根自转按体形（四足 `rollSpinTurns = 0` 低伏冲刺）。✅ 已落地。

### 为什么 W3.5 先行

狼 / 马 / wyvern 的动画必须自成体系；在 `forms/humanoid/` 与 `body_form/` 边界清晰前直接写生物分包，
会把人形专有实现（clips / pose_fns / system）继续留在顶层、被生物误用。先完成分包边界，再各写各的。

## 10. 兼容与红线

- 存档旧档缺字段安全回退（`bodyFormId` 缺省 humanoid；不兼容装备槽丢弃）。
- i18n 文案不硬编码；UI 走 `--dc-*` 令牌；帧内零分配。
- 状态机框架保持关节无关；体形专属状态按 `swimming`/`floating` 同模式在各分包登记。
- **禁止**把不同体形通过参数化塞进人形动画代码（本设计的红线）。
