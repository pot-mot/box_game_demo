# 装备与防御系统（攻击类别 / 护甲 / 肢体 / 防御与装备数值）

> 状态：**已实施**。伤害事件与命中链路见 [`attack_system.md`](attack_system.md) 第五节，工程结构与陷阱约定见 AGENTS.md。
> 关联：`src/save_load/`（存档兼容约定）、`src/character/armor/`（护甲 / 肢体领域层）。

## 一、目标与范围

三件事一并落地，因为它们共享同一条伤害结算链路：

1. **攻击类别（物理 / 魔法）** — 攻击携带类别，武器级声明（仅武器级，不落存档覆写）。
2. **护甲 / 肢体系统** — 角色可装备**四槽位护甲**（头盔 / 胸甲 / 臂甲 / 护腿）与**四槽位肢体组件**（头部 / 手臂 / 身体 / 腿部，种族：骷髅 / 兽人 / 精灵）。两者复用同一套数值机制（逐类别防御、逐类别攻击加成、移速修正）与外观构建机制；肢体**默认 replace**（装备即顶替对应人类肢体），颜色随阵营调色板重着色。
3. **角色数值修正** — 有效防御（基础防御 + 护甲 + 肢体之和）按类别做**固定减伤**（最小 1 点保底）；有效攻击 = 武器伤害 + 匹配类别的护甲 / 肢体攻击加成；有效移速 = 基础移速 × 各护甲 / 肢体移速乘数之积。

非目标（后续扩展，见第十节）：元素类别细分、套装加成、护甲耐久、AI 依据目标防御/移速选武器、护甲掉落/经济。

---

## 二、攻击类别（物理 / 魔法）

### 2.1 领域模型

新增 `src/character/combat/damage_type.ts`（常量 + 索引类型推导，遵循 AGENTS.md 禁 enum 约定）：

```ts
/** 攻击类别 */
export const DAMAGE_TYPES = ['physical', 'magic'] as const
export type DamageType = typeof DAMAGE_TYPES[number]

/** 类别中文名（面板 / HUD / 文档） */
export const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
    physical: '物理',
    magic: '魔法',
}

/** 逐攻击类别的数值档案（防御 / 攻击加成等共用） */
export type DamageTypeProfile = Readonly<Record<DamageType, number>>
```

### 2.2 武器声明（唯一真源）

`MeleeWeaponConfig` 与 `RangedWeaponConfig` 各新增**必填**字段：

```ts
/** 攻击类别（武器固有，不可被存档/面板覆写） */
readonly damageType: DamageType
```

- 必填而非可选：漏声明的武器直接编译报错（fail-closed），不设隐式物理默认。
- **不进入存档**：类别是武器固有属性，与动作/段时长同类；`AttackConfig` 不新增字段，`SAVE_FORMAT_VERSION` 不因本项变更（第四节护甲才需要升版）。
- 爆炸类弹丸的伤害类别**继承所属武器的类别**，不单独声明。

初版归属：

| 类别 | 武器 |
|------|------|
| 物理 | 短剑 / 长剑 / 巨剑 / 长枪 / 双斧 / 战锤 / 长弓 / 弩 / 霰弹枪 / 飞斧 / 手雷 / 燃烧瓶 / 飞镖 / `test_weapon` |
| 魔法 | 法杖 / 魔杖 |

> 手雷 / 燃烧瓶当前归物理（爆炸=物理冲击）；后续做元素类别时再细分（第十节）。

### 2.3 伤害事件扩展

`src/character/combat/damage.ts` 的 `DamageEvent` 增加必填字段：

```ts
export interface DamageEvent {
    readonly sourceId: number
    readonly targetId: number
    /** 攻击类别：决定按哪一类防御结算固定减伤 */
    readonly damageType: DamageType
    readonly baseAmount: number
    readonly finalAmount: number
    readonly skillId: string
    readonly dirX?: number
    readonly dirZ?: number
}
```

三条命中路径全部显式填充（必填字段保证编译期穷尽）：

| 路径 | 文件 | 取值 |
|------|------|------|
| 近战 | `entity/character/combat/melee_executor.ts` | `weapon.damageType`；伤害 = `(weapon.damage + attackBonus[类别]) × damageMultiplier` |
| 远程（直击） | `entity/character/combat/ranged_executor.ts` | 子弹创建时写入 `damageType: weapon.damageType`，伤害 = `weapon.damage + attackBonus[类别]` |
| 爆炸 | `character/combat/explosion.ts` | `applyExplosionDamage(..., damageType, ...)` 新参数，由 `detonateAt` 传子弹类别与伤害（已含攻击加成） |

其他伤害来源（死亡测试夹具 `death_fall.test.ts` 等）同步补字段。

---

## 三、角色数值修正（防御 / 攻击加成 / 移速）

### 3.1 领域模型

新增 `src/character/combat/defense.ts`：

```ts
import type {DamageTypeProfile} from './damage_type.ts'
import {MIN_DAMAGE} from './constants.ts'

/** 逐攻击类别防御（固定减伤值）；数值档案通用类型见 DamageTypeProfile */
export type DefenseProfile = DamageTypeProfile

/** 零数值档案（角色基础防御 / 攻击加成缺省值） */
export const ZERO_PROFILE: DamageTypeProfile = {physical: 0, magic: 0}

/** 逐类别数值求和（防御 / 攻击加成共用） */
export const addDamageProfiles = (a: DamageTypeProfile, b: DamageTypeProfile): DamageTypeProfile => ({
    physical: a.physical + b.physical,
    magic: a.magic + b.magic,
})

/**
 * 固定减伤：原始伤害 < MIN_DAMAGE 时保持原值，否则 max(MIN_DAMAGE, 伤害 − 对应类别防御)；
 * 最小伤害托底只抬高被减免后的结果，不会把小于 MIN_DAMAGE 的原始伤害放大。
 */
export const reduceByDefense = (amount: number, defense: number): number =>
    amount < MIN_DAMAGE ? amount : Math.max(MIN_DAMAGE, amount - defense)
```

`src/character/combat/constants.ts` 增加：

```ts
/** 固定减伤后的最小伤害（保底 1 点，防止高防完全免疫） */
export const MIN_DAMAGE = 1
```

### 3.2 减伤结算（`applyDamage` 内单点执行）

防御是**所有伤害路径的共同终点**，直接内建进 `applyDamage`，不走可增删的 `damageModifiers`（不可被绕过、不会重复应用）：

```ts
export const applyDamage = (
    target: {
        health: number
        maxHealth: number
        /** 有效防御（缺省不结算防御减伤；测试 mock 可不填） */
        readonly defense?: DefenseProfile
        /** 无敌帧剩余时间（秒，翻滚中段）：> 0 时完全免疫，测试 mock 可不填 */
        readonly invincibleTimer?: number
        readonly damageModifiers?: readonly DamageModifier[]
        onDamageTaken: ((amount: number, event: DamageEvent) => void) | null
        onDeath: (() => void) | null
    },
    event: DamageEvent,
): DamageEvent => {
    /* 翻滚无敌帧：先于一切结算直接免疫（不扣血 / 不回调 / 不判死，见 attack_system.md §3.7） */
    if ((target.invincibleTimer ?? 0) > 0) {
        return {...event, finalAmount: 0}
    }
    let finalEvent = event
    if (target.damageModifiers) {
        for (const mod of target.damageModifiers) finalEvent = mod(finalEvent)
    }
    /* 结算顺序：修饰器 → 防御固定减伤（最后一步，不可被修饰器绕过） */
    if (target.defense !== undefined) {
        finalEvent = {
            ...finalEvent,
            finalAmount: reduceByDefense(finalEvent.finalAmount, target.defense[finalEvent.damageType]),
        }
    }
    target.health = Math.max(0, target.health - finalEvent.finalAmount)
    target.onDamageTaken?.(finalEvent.finalAmount, finalEvent)
    if (target.health <= 0) target.onDeath?.()
    return finalEvent
}
```

- `baseAmount` 始终保持武器原始伤害；`finalAmount` 为修饰器与防御结算后的实际扣血。
- 最小 1 点保证轻武器对重甲仍有削血与硬直触发（`flinch` 链路不变）；原始伤害本身低于 1 点时保持原值（面板/存档允许亚 1 点伤害覆写，不被托底放大）。
- **攻击加成在攻击侧结算**（伤害进入 `DamageEvent` 之前）：近战 `(weapon.damage + attackBonus[类别]) × damageMultiplier`；远程把加成并入子弹 `damage`，爆炸继承该值；不匹配类别的加成不参与。

### 3.3 有效属性的组成与重算

| 有效属性 | 公式 | 说明 |
|----------|------|------|
| 防御 `defense` | 基础防御（存档持久化）+ 各槽位护甲防御之和 | `applyDamage` 按事件类别取用 |
| 攻击加成 `attackBonus` | 各槽位护甲攻击加成之和（无基础项） | 攻击时仅与武器类别匹配的项计入伤害 |
| 移速乘数 `moveSpeedMultiplier` | 各槽位护甲移速乘数之积（空装备 = 1） | 状态机经 `moveSpeedOf(entity)` 读取 |

`CombatComponent`（`character/combat/types.ts`）新增五字段：

```ts
/** 基础防御（角色固有，存档持久化） */
baseDefense: DefenseProfile
/** 装备的护甲（槽位 → 护甲 id；缺省 = 空槽） */
armor: ArmorLoadout
/** 有效防御 = 基础防御 + 各护甲之和；applyDamage 按事件类别取用 */
defense: DefenseProfile
/** 装备攻击加成（逐类别，与武器类别匹配才计入） */
attackBonus: DamageTypeProfile
/** 装备移速乘数（多件相乘，1 = 无修正） */
moveSpeedMultiplier: number
```

统一入口（与 `setCombatWeapon` 同风格）：

```ts
/** 变更基础防御 / 护甲：校验并重算防御、攻击加成与移速乘数（未知护甲 id 安全回退空槽，不抛错） */
export const setCombatEquipment = (
    c: CombatComponent,
    baseDefense: DefenseProfile,
    armor: ArmorLoadout,
): void => {
    c.baseDefense = baseDefense
    c.armor = armor
    const resolved = resolveArmorLoadout(armor)
    c.defense = totalDefenseOf(baseDefense, resolved)
    c.attackBonus = totalAttackOf(resolved)
    c.moveSpeedMultiplier = totalMoveSpeedOf(resolved)
}
```

- `createCombatComponent` 初始化为 `ZERO_PROFILE` / `{}` / `ZERO_PROFILE` / `ZERO_PROFILE` / `1`。
- 移速统一入口（`character/types.ts`）：

```ts
/** 当前有效移速 = 基础移速（config.speed）× 装备移速乘数；状态机全部移动速度统一由此推导 */
export const moveSpeedOf = (entity: CharacterEntity): number =>
    entity.config.speed * entity.combat.moveSpeedMultiplier
```

`walking` / `jumping` / `falling`（含最大速度钳制）/ `rolling` / `attacking` 默认阶段行为的移动速度全部改读 `moveSpeedOf(entity)`。
- 所有直接构造 `CombatComponent` 的测试夹具（`physics/harness.ts`、`ai/ai.test.ts`、`ai/nav/nav.test.ts`）补五个字段。

---

## 四、护甲系统

### 4.1 领域模型（新分包 `src/character/armor/`）

依赖方向：`character/armor/` → `character/combat/damage_type.ts` / `combat/defense.ts`（值）与 `entity/character/appearance/armor_mesh.ts`（仅类型，沿用 `melee_weapon.ts` → `weapon_mesh.ts` 的既有先例）；被 `entity/character/` 依赖，反向不成立。

`slots.ts`：

```ts
export const ARMOR_SLOTS = ['head', 'chest', 'arms', 'legs'] as const
export type ArmorSlot = typeof ARMOR_SLOTS[number]

export const ARMOR_SLOT_LABELS: Record<ArmorSlot, string> = {
    head: '头盔', chest: '胸甲', arms: '臂甲', legs: '护腿',
}

/** 肢体槽位：与护甲槽位是两套独立槽位，面板同一行左右并列（左护甲 / 右肢体） */
export const LIMB_SLOTS = ['head', 'arms', 'body', 'legs'] as const
export type LimbSlot = typeof LIMB_SLOTS[number]

export const LIMB_SLOT_LABELS: Record<LimbSlot, string> = {
    head: '头部', arms: '手臂', body: '身体', legs: '腿部',
}
```

`types.ts`（护甲与肢体共用泛型装备结构）：

```ts
import type {DamageTypeProfile} from '../combat/damage_type.ts'
import type {ArmorMeshConfig, LimbMeshConfig} from '../../entity/character/appearance/armor_mesh.ts'
import type {ArmorSlot, LimbSlot} from './slots.ts'

/** 单件装备（领域数据：槽位 + 数值修正 + 程序化外观配方）；护甲与肢体共用 */
export interface EquipPieceConfig<S extends string, M> {
    readonly id: string          // 装备 id（目录键，存档持久化）
    readonly name: string        // 中文名（面板 / 提示）
    readonly slot: S
    readonly defense: DamageTypeProfile          // 逐攻击类别防御（固定减伤）
    readonly attack: DamageTypeProfile           // 逐攻击类别攻击加成（匹配武器类别才计入）
    readonly moveSpeedMultiplier: number         // 移速乘数（多件相乘）
    readonly mesh: M                             // 外观部件配方
}

export type ArmorPieceConfig = EquipPieceConfig<ArmorSlot, ArmorMeshConfig>
export type ArmorLoadout = Readonly<Partial<Record<ArmorSlot, string>>>
export type ResolvedArmorLoadout = Readonly<Partial<Record<ArmorSlot, ArmorPieceConfig>>>

/** 肢体组件：种族肢体（默认顶替对应人类肢体，颜色随阵营调色板） */
export type LimbPieceConfig = EquipPieceConfig<LimbSlot, LimbMeshConfig>
export type LimbLoadout = Readonly<Partial<Record<LimbSlot, string>>>
export type ResolvedLimbLoadout = Readonly<Partial<Record<LimbSlot, LimbPieceConfig>>>
```

`catalog.ts`：

```ts
export const ARMOR_PRESETS: Record<string, ArmorPieceConfig> = { /* armor_pieces.ts 汇总 */ }
export const LIMB_PRESETS: Record<string, LimbPieceConfig> = { /* limb_pieces.ts 汇总 */ }
export const ALL_ARMOR_PRESETS / ALL_LIMB_PRESETS = Object.values(...)
export const findArmorPreset / findLimbPreset = (id: string | undefined) => ...
/** 某槽位可选装备（面板下拉用） */
export const armorPiecesOfSlot / limbPiecesOfSlot = (slot) => ...
/** 校验装备表：未知 id / 槽位不匹配 → 空槽（存档容错，不抛错）；肢体 undefined/null → 空 */
export const resolveArmorLoadout / resolveLimbLoadout = (loadout) => ...
/** 有效防御 = 基础防御 + 各护甲防御之和 + 各肢体防御之和 */
export const totalDefenseOf = (base, resolvedArmor, resolvedLimbs?): DefenseProfile => ...
/** 攻击加成 = 各护甲 + 各肢体攻击加成之和（与武器类别匹配时才计入） */
export const totalAttackOf = (resolvedArmor, resolvedLimbs?): DamageTypeProfile => ...
/** 移速乘数 = 各护甲 × 各肢体移速乘数之积（空装备表 = 1） */
export const totalMoveSpeedOf = (resolvedArmor, resolvedLimbs?): number => ...
```

`resolvedLimbs` 为可选参数：不传时行为与仅护甲完全一致（向后兼容既有调用与测试）。

`armor_pieces.ts`：初版数据（数值待试玩调参；护栏：四件满配逐类别防御 ≤ 9、单件攻击加成 ≤ 2）：

| 槽位 | id | 名称 | 物防 | 魔防 | 物攻 | 魔攻 | 移速 |
|------|----|------|-----:|-----:|-----:|-----:|-----:|
| head | `cloth_cap` | 布帽 | 0 | 1 | 0 | 0 | 1 |
| head | `iron_helmet` | 铁盔 | 2 | 0 | 0 | 0 | 0.98 |
| head | `mage_hood` | 法师兜帽 | 0 | 2 | 0 | 1 | 1 |
| chest | `cloth_vest` | 布衣 | 1 | 0 | 0 | 0 | 1 |
| chest | `leather_armor` | 皮甲 | 2 | 1 | 0 | 0 | 1 |
| chest | `iron_plate` | 铁胸甲 | 3 | 0 | 0 | 0 | 0.9 |
| chest | `mage_robe` | 法袍 | 0 | 3 | 0 | 0 | 1 |
| chest | `scale_mail` | 鳞甲 | 3 | 2 | 0 | 0 | 0.92 |
| arms | `cloth_bracers` | 布护腕 | 0 | 1 | 0 | 0 | 1 |
| arms | `iron_bracers` | 铁臂甲 | 2 | 0 | 1 | 0 | 1 |
| arms | `battle_bracers` | 战臂甲 | 1 | 1 | 2 | 0 | 0.97 |
| arms | `mage_wraps` | 法印护腕 | 0 | 2 | 0 | 1 | 1 |
| legs | `cloth_pants` | 布裤 | 1 | 0 | 0 | 0 | 1 |
| legs | `iron_greaves` | 铁胫甲 | 2 | 0 | 0 | 0 | 0.95 |
| legs | `mage_leggings` | 法师护腿 | 0 | 2 | 0 | 0 | 1 |
| legs | `swift_boots` | 疾行靴 | 0 | 0 | 0 | 0 | 1.15 |
| legs | `wind_boots` | 疾风靴 | 0 | 1 | 0 | 0 | 1.25 |

设计要点：

- **法师系头盔提供法术攻击力**：`mage_hood`（法师兜帽）魔攻 +1；`mage_wraps`（法印护腕）亦提供魔攻 +1，供法系堆叠。
- **重甲减速**：铁盔 / 铁胸甲 / 铁胫甲 / 战臂甲 / 鳞甲均 `moveSpeedMultiplier < 1`；满配物理重甲约 ×0.81，用移速换取防御。
- **加速鞋**：`swift_boots`（疾行靴 ×1.15）与 `wind_boots`（疾风靴 ×1.25）占护腿槽位、无防御收益，作为移速流代价。

### 4.1.1 肢体组件预设（`limb_pieces.ts`）

肢体组件复用护甲的全部数值机制，每个槽位提供三族（骷髅 / 兽人 / 精灵）。数值倾向：**骷髅**法抗 / 敏捷、**兽人**物防物攻厚重、**精灵**均衡魔攻灵动。护栏：单件逐类别防御 ≤ 2、攻击加成 ≤ 1（与护甲叠加不过度膨胀）。

| 槽位 | 种族 | id | 名称 | 物防 | 魔防 | 物攻 | 魔攻 | 移速 |
|------|------|----|------|-----:|-----:|-----:|-----:|-----:|
| head | skeleton | `skeleton_head` | 骷髅头颅 | 0 | 1 | 0 | 1 | 1 |
| head | orc | `orc_head` | 兽人头颅 | 2 | 0 | 0 | 0 | 0.98 |
| head | elf | `elf_head` | 精灵头颅 | 0 | 1 | 0 | 1 | 1.02 |
| arms | skeleton | `skeleton_arms` | 骷髅臂骨 | 0 | 1 | 0 | 1 | 1.02 |
| arms | orc | `orc_arms` | 兽人臂膀 | 1 | 0 | 1 | 0 | 0.97 |
| arms | elf | `elf_arms` | 精灵手臂 | 1 | 0 | 0 | 1 | 1 |
| body | skeleton | `skeleton_body` | 骷髅躯干 | 1 | 1 | 0 | 0 | 1 |
| body | orc | `orc_body` | 兽人躯干 | 2 | 0 | 1 | 0 | 0.95 |
| body | elf | `elf_body` | 精灵身躯 | 1 | 2 | 0 | 0 | 1 |
| legs | skeleton | `skeleton_legs` | 骷髅腿骨 | 0 | 1 | 0 | 0 | 1.05 |
| legs | orc | `orc_legs` | 兽人腿脚 | 1 | 0 | 0 | 0 | 0.96 |
| legs | elf | `elf_legs` | 精灵腿脚 | 0 | 1 | 0 | 0 | 1.08 |

- **默认 replace**：装备任一肢体即顶替该槽位对应的**全部**人类部位（头 / 上臂+前臂+手 / 躯干 / 大腿+小腿），无需在配方里声明 `hideBodyParts`（`LimbMeshConfig` 不含该字段，replace 恒开启）。
- **空 / undefined / null = 默认人类肢体**：`limb` 缺字段、值为 `undefined` 或校验失败（含 `null`）均回退空槽，人类部位照常显示。

### 4.2 外观装配（共享网格构建器 + 独立 gen）

`src/entity/character/appearance/mesh_builder.ts`（**新增，武器与护甲共用**）：

```ts
/** 程序化网格构建器：统一登记几何 / 材质 / 网格，集中释放 */
export interface MeshBuilder {
    readonly group: Group
    readonly material: (color: number, roughness?: number, metalness?: number) => MeshStandardMaterial
    readonly box: (w: number, h: number, d: number) => BoxGeometry
    readonly cylinder: (rTop: number, rBottom: number, height: number, segments?: number) => CylinderGeometry
    readonly sphere: (radius: number, widthSegments?: number, heightSegments?: number) => SphereGeometry
    readonly cone: (radius: number, height: number, segments?: number) => ConeGeometry
    readonly add: (geometry, material, x, y, z, rx?, ry?, rz?) => Mesh
    /** 六面明暗方块部件（与方块人身体同风格） */
    readonly faceBox: (w, h, d, color, x, y, z) => Mesh
    readonly dispose: () => void
}
export const createMeshBuilder = (): MeshBuilder
```

- 该构建器从 `weapon_mesh.ts` 抽离共用工具（几何 / 材质工厂、网格组装、生命周期统一释放），并按需补一个与身体一致的 `faceBox`。**武器与护甲都经它构建**：`weapon_mesh` 的 `gen*` 与 `armor_mesh` 的 `gen*` 均接收 `(builder, 参数)`，各自独立拼装模型，不再有模块级共享数组与全局 `begin()`。

`src/entity/character/appearance/armor_mesh.ts`（**重写：每个形状一个独立 `gen` 构造函数**）：

```ts
/** 护甲外观形状 id（常量 + 索引类型推导） */
export const ARMOR_MESH_IDS = ['cap', 'helmet', 'hood', 'vest', 'plate', 'robe', 'bracer', 'greaves', 'legwrap', 'boots'] as const
export type ArmorMeshId = typeof ARMOR_MESH_IDS[number]

/** 身体部位名（语义标识，与骨架关节 id 解耦，供护甲声明顶替部位） */
export const ARMOR_BODY_PARTS = ['head', 'torso', 'rightUpperArm', 'rightForearm', 'rightHand',
    'leftUpperArm', 'leftForearm', 'leftHand', 'rightThigh', 'rightShin', 'leftThigh', 'leftShin'] as const
export type ArmorBodyPart = typeof ARMOR_BODY_PARTS[number]

/** 身体部位 → 承载该部位基础模型的关节 id（与 assembleCharacterAppearance 挂载目标一致） */
export const ARMOR_BODY_PART_JOINTS: Readonly<Record<ArmorBodyPart, string>> = { /* … */ }

export interface ArmorMeshConfig {
    readonly id: ArmorMeshId
    readonly color: number
    readonly accentColor?: number
    /** 装备后隐藏的身体部位（护甲顶替该部位模型而非叠加）；缺省 = 不隐藏 */
    readonly hideBodyParts?: readonly ArmorBodyPart[]
}

export interface ArmorMeshResult {
    readonly group: Group
    readonly cleanup: () => void
}

/** 按配方 + 挂载关节构建护甲部件 */
export const createArmorMesh = (config: ArmorMeshConfig, jointId: string): ArmorMeshResult
```

- **参数化 gen**：每个形状是一个显式生成器 `ArmorGen = (b: MeshBuilder, p: ArmorGenParams) => void`，参数 `p` 携带关节基准部件尺寸 `base`（`PRESET_PART_SIZES` 对应身体部件）与已解析的 `color` / `accentColor`（缺省回退主色暗化）。`ARMOR_SHAPES: Record<ArmorMeshId, {joints?, gen}>` 只做「形状 → 生成器 + 关节白名单」的派发，尺寸 / 部件构成全部写在各 `gen` 内（参照 `weapon_mesh` 的 `genSword` / `genStaff` 等）。
- 关节基准尺寸决定覆盖部位：`headNeck` = 头、`spine` = 躯干、`right/leftArmElbow` = 前臂、大腿关节 = 腿甲、膝关节 = 胫甲；形状可声明 `joints` 白名单（靴只包小腿、不包大腿）；未知关节返回空 Group（骨架被编辑后安全跳过）。
- 主体尺寸统一 `身体部件 × 乘数 + 2 × ARMOR_PAD`（`appearance/constants.ts`）；装饰件（铁盔额檐 / 顶脊、法袍下摆 / 领口、胸甲肩甲、兜帽尖顶与垂布、护腕束带、胫甲护片、绑腿束结、靴尖前伸）由各 `gen` 独立表达。
- 外观件是**纯视觉子节点**：不生成碰撞体、不进入 `getMeshes()`（角色系统只返回胶囊 mesh）、不参与受击箱 / 视线 / 导航，因此不会影响任何判定。

`CharacterModel`（`appearance/types.ts`）新增：

```ts
/** 装备护甲（四槽，先移除旧护甲；空槽 = 移除该槽） */
equipArmor: (loadout: ResolvedArmorLoadout) => void
/** 移除全部护甲 */
removeArmor: () => void
/** 装备肢体组件（四槽，先移除旧肢体；空槽 = 回退默认人类肢体；颜色随阵营调色板） */
equipLimbs: (loadout: ResolvedLimbLoadout) => void
/** 移除全部肢体组件（回退默认人类肢体） */
removeLimbs: () => void
```

`model.ts` 内的槽位 → 关节映射（entity 侧持有，护甲领域数据不接触关节 id）：

```ts
const ARMOR_SLOT_JOINTS: Record<ArmorSlot, readonly string[]> = {
    head: ['headNeck'],
    chest: ['spine'],
    arms: ['rightArmElbow', 'leftArmElbow'],
    legs: ['leftLegHip', 'rightLegHip', 'leftLegKnee', 'rightLegKnee'],
}
```

每槽记录 `{group, cleanup}`，`equipArmor` 先清理旧部件再逐个关节 `createArmorMesh` 挂载；`dispose` 时清理全部护甲。动画系统零改动：护甲挂在被动画驱动的关节 Group 下，自动跟随姿态（手臂甲随挥击摆动）。

**顶替身体部件（`hideBodyParts`）**：护甲默认是「在身体部件外叠加一层」，近全包件可声明要顶替的部位——`equipArmor` 通过 `ARMOR_BODY_PART_JOINTS` 找到该部位的基础部件并置 `visible = false`，卸下 / 换装时按记录的原始可见性还原（同一部件只备份一次）。身体部件是纯视觉子节点，隐藏不影响胶囊碰撞 / 受击箱 / 视线 / 导航。当前启用：仅靴（疾行靴 / 疾风靴）顶替两小腿；其余护甲均保留身体部件、纯叠加覆盖（视觉更自然），需要时可逐件追加 `hideBodyParts`。

**肢体外观（`createLimbMesh`）与 replace**：肢体复用护甲关节基座与 `mesh_builder`，`LIMB_SLOT_JOINTS` 决定挂载关节（头 `headNeck`、躯干 `spine`、整条手臂（上/前臂+手）、整条腿（大腿+小腿）），`LIMB_SLOT_HIDDEN_PARTS` 声明该槽位顶替的人类部位（replace 恒开启）。`equipArmor` / `equipLimbs` 共用一个 `refreshHiddenBodyParts`：先整体还原旧隐藏，再按「当前护甲 + 当前肢体」统一隐藏，因此**卸下护甲不会误还原被肢体顶替的部位，反之亦然**。种族基色来自 `LimbMeshConfig.color`（骷髅骨白 / 兽人绿皮 / 精灵苍白），披挂 / 束带 / 发色取自角色阵营调色板（`BoxPartPalette` 的 `bodyColor` / `hairColor`）；`model.recolor` 更新调色板后若已装备肢体会重建肢体外观（仅在换阵营时发生，非每帧）。肢体高度严格对齐被顶替的人类部件、粗壮度只体现在宽深，避免沉入地面 / 超出身高。

**种族外观细节（`genLimb*` + `drawRaceFaceCanvas`）**：头部主块使用 `drawRaceFaceCanvas(race, palette)` 生成**像素风种族脸**（前面 map，其余五面同风格明暗），三族几何特征独立：
- **骷髅（骨骼化）**：
  - **头部（真实空洞，非黑色体块）**：以「**暗腔底板 + 留有开口的前置骨质框**」构造——暗腔底板（`SKELETON_HOLLOW_COLOR`）位于面颅之前，其前方由眉骨 / 鼻梁 / 两侧颧骨 / 上颌骨拼成骨质框，**眼窝与口腔处留空**露出后方暗腔（因不能做 CSG，采用「暗底 + 开口框」表现镂空）；**下颌骨**独立成块（明显窄于上颅、前突、带两侧升支与象牙白齿列），与上颌之间留出**口腔空洞**；**眉骨**为横贯前脸上缘、略宽出额面的凸起骨脊（凶相）；眼窝深处嵌两枚 `SKELETON_EYE_COLOR` **凶光红点**。
  - **躯干**：**空心胸腔**——不建实心主躯，由纵向脊柱（椎骨列）+ 左右成对的 5 对**肋骨**（围出中空、不封前胸）+ 胸骨 + 上端**锁骨** + 下端**骨盆**骨环拼成。
  - **四肢**：细骨干（约骨节宽度 0.6）+ 两端**加粗骨节**与骨节暗缝（关节粗、骨干细）。
- **兽人**：小眼 + 眉骨 + 咧嘴獠牙；前突下颚 + 獠牙几何、双肩甲、胸肌板、肌肉隆起段 + 阵营色腰带。
- **精灵（日式女性化）**：大眼 + 睫毛（上挑眼线）+ 柔和小鼻小口 + 腮红（`ELF_BLUSH_COLOR`）；**金发**（`ELF_GOLDEN_HAIR_COLOR`，不随阵营）——顶发盖 + 齐刘海 + 两侧鬓发 + 后脑长发；**后掠尖耳**（锥尖绕 X 轴前倾指向 -Z 后方）。
  - **真棱台曲线轮廓**（`frustumStack`：用 4 边 `cylinder`，每段 `radiusTop !== radiusBottom`，即**上下底面不一样大**的锥台，逐段收放成折线曲线；旋转 45° 后截面为矩形，以 `scale.z` 压扁）：躯干为**沙漏**（宽肩 `1.0` → 收胸 → **细腰 `0.54`** → 张胯 `0.94` → 收腿根）；**四肢**为上粗下细的锥形（上端 `1.0` → 关节 `0.68` → 端部微张做腕 / 踝）。**胸前无居中突出物**（旧版腹部竖棱与胸部突起已移除，仅保留两肩斜下的点缀细带）；阵营色腰封卡在最细处强化细腰。**不在颈部放置金发色部件**（避免「胡子」观感）。
脸部贴图材质与 CanvasTexture 经 `mesh_builder` 的 `trackMaterial` / `trackTexture` 登记，随 `cleanup` 一并释放（不泄漏）。阵营色仍以额带 / 束带 / 肩甲 / 腰封形式注入三族模型（精灵金发与种族基色除外）。跨模块共用的颜色（象牙白 / 骷髅骨腔 / 骷髅眼红 / 金发 / 腮红）集中在 `render/constants.ts`。

**阵营 → 涂色唯一入口（`appearance/constants.ts` 的 `factionColorOf(faction)`）**：人类身体、肢体披挂、面板色点、展示台全部复用同一映射——基础色按 `faction % 6` 取（**0 红 / 1 蓝 / 2 绿 / 3 黄 / 4 粉 / 5 灰**），每右移一圈按「暗 / 亮 / 原」微调明暗；`SELECT_PALETTE` 的 `bodyColor` 即 `factionColorOf(faction)`，保证同一阵营数字在全项目得到完全一致的颜色（种族展示条目也使用同一编号体系，不再自带偏移）。

### 4.3 系统接线（`world.ts`）

- `spawnEntity`：`createCombatComponent` 初始化零防御 / 空护甲 / 空肢体 / 无攻击加成 / 移速 1（新建角色外观自然无护甲与肢体，`equipArmor` / `equipLimbs` 仅在存档载入与面板应用时调用）。
- `add()`（存档载入）：spawn 后调用 `setCombatEquipment(entity.combat, saveConfig.defense ?? ZERO_PROFILE, saveConfig.armor ?? {}, saveConfig.limb ?? {})`，再 `model.equipArmor(resolveArmorLoadout(...))` 与 `model.equipLimbs(resolveLimbLoadout(...))`（与 maxHealth 覆盖同层，加载后刷新列表行）。
- `updateCharacterConfig()`（面板应用）：末位可选参数 `newEquipment?: {baseDefense?: DefenseProfile; armor?: ArmorLoadout; limb?: LimbLoadout}`，内部 `setCombatEquipment` +（对应项传入时）`model.equipArmor` / `model.equipLimbs`；未传项保持原值（`setCombatEquipment` 的 `limb` 省略 = 保持原肢体）。
- 换阵营：`newFaction` 分支调用 `model.recolor(SELECT_PALETTE(newFaction))`，已装备肢体会据此重建外观。
- 列表行 `rowText`：防御展示 `def:物X/魔Y`，移速展示**有效移速**（保留两位小数去尾，如 `spd:6.69`）。

### 4.4 面板（`entity/character/ui/panel.ts`）

角色面板按「装备 / 属性」两模块组织（与其它分区同风格，复用 `createSection` / `createLabeledNumberInput`）。

**装备模块**：武器与装备统一放置——武器下拉（含数值覆写与攻击类别标签）、**副手武器下拉**（首项「无」；主手为远程时禁用）与**持握模式下拉**（选项 = 武器类 `holdModes` ∩ 双持可用性，`HOLD_MODE_LABELS` 中文名）、**四行两列装备区**。Apply 顺序 = 主手 / 副手配置 → `setHoldMode`（详见 [`melee_hold_modes.md`](melee_hold_modes.md)）。

**装备区一行两列（左护甲 / 右肢体）**，按语义顺序 头部 → 手臂 → 身体 → 腿部（`EQUIP_ROWS`，其中「身体」肢体对应胸甲槽的同一区域）：

| 控件 | 类型 | 行为 |
|------|------|------|
| 左列：头盔 / 臂甲 / 胸甲 / 护腿 | 四个 `<select>`（首项「无」= 空槽；选项文案由 `describeArmorPiece` 生成，列出非零的防御 / 攻击加成 / 移速修正） | 读取 `armorPiecesOfSlot(slot)` |
| 右列：肢体（标签文案「肢体·`LIMB_SLOT_LABELS[slot]`」，如「肢体·头部」） | 四个 `<select>`（首项「无」= 默认人类肢体；选项 = 骷髅 / 兽人 / 精灵） | 读取 `limbPiecesOfSlot(slot)` |

**属性模块**：生命、基础防御与装备数值预览。

| 控件 | 类型 | 行为 |
|------|------|------|
| MaxHP / CurHP | 两个数字输入 | 对应 `combat.maxHealth` / `combat.health` |
| 基础防御（物理 / 魔法） | 两个数字输入 | 对应 `combat.baseDefense` |
| 数值预览 | 只读多行标签 | 选择 / 基础防御 / 基础移速变化即时刷新：有效防御、攻击加成、有效移速（基础 × 装备乘数）；复用 `resolveArmorLoadout` / `resolveLimbLoadout` 与目录汇总函数，与运行时 `setCombatEquipment` 同一口径 |

- `refreshFullConfig` 回显八个下拉（护甲 + 肢体；无效 / 槽位不匹配的存档 id 显示「无」）、基础防御输入与数值预览。
- `onApply` 组装 `ArmorLoadout` / `LimbLoadout`（空 value → 省略该槽）与 `DefenseProfile`，随 `updateCharacterConfig` 提交。
- 武器标签（`weaponTag`）附带攻击类别（`· 物理` / `· 魔法`），便于对照当前武器的攻击加成与目标防御。

---

## 五、存档与兼容

`CharacterSaveConfig`（`save_load/types.ts`）新增三个**可选**字段：

```ts
/** 基础防御（逐类别固定减伤；缺省 = 0/0，旧档安全回退） */
defense?: {physical: number; magic: number}
/** 护甲装备（槽位 → 护甲 id；缺省 / 未知 id = 空槽，不抛错） */
armor?: {head?: string; chest?: string; arms?: string; legs?: string}
/** 肢体组件装备（槽位 → 肢体 id；缺省 / 未知 id = 默认人类肢体，不抛错） */
limb?: {head?: string; arms?: string; body?: string; legs?: string}
```

- `SAVE_FORMAT_VERSION` 3 → 4（防御 + 护甲）→ 5（锁定点）→ 6（副手 / 持握）→ **7（肢体 `limb`）**；旧档缺字段由校验层回退默认，**无迁移逻辑**（v1 脚底原点迁移保持原样）。
- `validation.ts`：`DefenseProfileSchema`（`z.number().min(0).default(0)`，整体 `.optional().catch(undefined)`）；`ArmorLoadoutSchema`（`head`/`chest`/`arms`/`legs`）；`LimbLoadoutSchema`（`head`/`arms`/`body`/`legs`），均整体 `.optional().catch(undefined)`。
- `serialize.ts`：写出 `defense: e.combat.baseDefense`、`armor: e.combat.armor` 与 `limb: e.combat.limb`（攻击加成 / 移速由预设重算，不入档）。
- `deserialize.ts`：无需特判，config 原样传入 `add()`。
- 非法数据安全回退链路：`armor` / `limb` 非对象 → 空装备表；未知 id / 槽位与 id 不符 → 该槽空；`defense` 非法 → 0/0；肢体 `null` / 缺失 → 默认人类肢体。

---

## 六、改动文件清单

**新增**

| 文件 | 内容 |
|------|------|
| `src/character/combat/damage_type.ts` | `DAMAGE_TYPES` / `DAMAGE_TYPE_LABELS` / `DamageTypeProfile` |
| `src/character/combat/defense.ts` | `DefenseProfile` / `ZERO_PROFILE` / `addDamageProfiles` / `reduceByDefense` |
| `src/character/combat/damage.test.ts` | 伤害结算单测 |
| `src/character/armor/slots.ts` | 四槽位常量与中文名 |
| `src/character/armor/types.ts` | 护甲配置（防御 / 攻击加成 / 移速）与装备表类型 |
| `src/character/armor/catalog.ts` | 目录查询 / 校验 / 防御与攻击汇总 / 移速汇总 |
| `src/character/armor/armor_pieces.ts` | 护甲预设数据（含臂甲与加速鞋） |
| `src/character/armor/limb_pieces.ts` | 肢体组件预设（骷髅 / 兽人 / 精灵 × 四槽位） |
| `src/character/armor/catalog.test.ts` | 目录、数值汇总与回退单测 |
| `src/character/armor/limb_catalog.test.ts` | 肢体目录、数值护栏、回退与护甲+肢体合并汇总单测 |
| `src/entity/character/appearance/limb_mesh.test.ts` | 种族肢体构建 / 粗壮度 / 阵营重着色单测 |
| `src/entity/character/appearance/mesh_builder.ts` | 共享网格构建器（武器 / 护甲共用的几何 / 材质工厂与生命周期管理） |
| `src/entity/character/appearance/mesh_builder.test.ts` | 构建器几何工厂 / 组装 / 释放单测 |
| `src/entity/character/appearance/armor_mesh.ts` | 程序化护甲部件构建器（每形状独立 gen + 关节白名单） |
| `src/entity/character/appearance/armor_mesh.test.ts` | 构建 / 清理 / 关节白名单 / 外扩尺寸单测 |
| `e2e/character_equipment.spec.ts` | 面板护甲交互端到端用例 |
| `docs/equipment_system.md` | 本文档 |

**修改（核心）**

| 文件 | 改动 |
|------|------|
| `src/character/combat/constants.ts` | `MIN_DAMAGE` |
| `src/character/combat/damage.ts` | `DamageEvent.damageType` + 防御结算 |
| `src/character/combat/explosion.ts` | `damageType` 参数 |
| `src/character/combat/types.ts` | `baseDefense` / `armor` / `defense` / `attackBonus` / `moveSpeedMultiplier` + `setCombatEquipment` |
| `src/character/types.ts` | `moveSpeedOf`（有效移速统一入口） |
| `src/character/state_machine/states/` | `walking` / `jumping` / `falling` / `rolling` / `attacking` 改读 `moveSpeedOf` |
| `src/character/weapon/melee_weapon.ts` / `ranged_weapon.ts` | 全部预设补 `damageType` |
| `src/entity/character/combat/melee_executor.ts` / `ranged_executor.ts` | 命中路径填 `damageType`；伤害计入攻击加成 |
| `src/entity/character/appearance/types.ts` / `model.ts` | `equipArmor` / `removeArmor` / `equipLimbs` / `removeLimbs` + 护甲&肢体槽位关节映射 + `refreshHiddenBodyParts` 统一顶替 |
| `src/entity/character/appearance/armor_mesh.ts` | 关节基座补肩/手、`LimbMeshConfig` + `createLimbMesh` |
| `src/entity/character/physics/world.ts` | spawn/add/面板提交接线（含 limb）、行文本（def + 有效移速） |
| `src/entity/character/ui/panel.ts` | 装备区一行两列（左护甲 / 右肢体）+ 防御/攻击/移速预览 |
| `src/save_load/types.ts` / `validation.ts` / `serialize.ts` | 存档字段与 v7（limb） |
| 测试夹具 | `physics/harness.ts`、`ai/ai.test.ts`、`ai/nav/nav.test.ts` 补 combat 字段；`physics/death_fall.test.ts`、`combat_vfx/material_effects.test.ts` 等补伤害事件 `damageType` |
| `docs/attack_system.md`、`AGENTS.md` | 实施收尾同步（第五节伤害链路、结构/陷阱/文档表） |

---

## 七、实施步骤（已完成）

**M1 攻击类别（可独立合并）**

1. `damage_type.ts` + `DamageEvent.damageType` + 武器配置/预设补字段。
2. 三条命中路径填值，更新全部测试夹具。
3. 验证：`pnpm type-check` + `pnpm vitest run src/character/combat src/character/weapon`。

**M2 防御力**

1. `defense.ts` + `MIN_DAMAGE` + `applyDamage` 结算。
2. `CombatComponent` 字段 + `setCombatEquipment` + 夹具。
3. 验证：`pnpm vitest run src/character/combat src/entity/character/combat`。

**M3 护甲**

1. `character/armor/` 领域层与预设。
2. `armor_mesh.ts` + `CharacterModel.equipArmor`。
3. `world.ts` 接线 + `panel.ts` 护甲区 + 行文本。
4. 存档三件套 + 版本 4。
5. 验证：`pnpm vitest run src/character/armor src/entity/character/appearance src/save_load` + `pnpm test:e2e character_equipment.spec.ts`。

**M4 收尾**

1. 文档：`docs/attack_system.md` 补攻击类别与防御结算；AGENTS.md 更新结构、陷阱与文档表。
2. 全量验证：`pnpm test`；UI/交互改动追加 `pnpm test:e2e`；涉及存档与入口链路追加 `pnpm build`。

**M5 装备数值扩展（臂甲 / 攻击加成 / 移速）**

1. 类型层：`DamageTypeProfile`、`addDamageProfiles`、`ZERO_PROFILE`（攻击与防御共用档案）。
2. 护甲：新增 `arms` 槽位；`ArmorPieceConfig` 增加 `attack` / `moveSpeedMultiplier`；新增臂甲 4 件与加速鞋 2 件；`totalAttackOf` / `totalMoveSpeedOf`。
3. 外观：前臂关节基座 + `bracer` / `boots` 形状（`joints` 白名单、`accent.z` 脚尖）。
4. 运行时：`CombatComponent.attackBonus` / `moveSpeedMultiplier`；`moveSpeedOf` 接入五个状态；近战/远程伤害计入攻击加成。
5. 接线：角色面板重构为「装备 / 属性」两模块（武器 + 护甲统一为装备模块，生命 + 基础防御 + 数值预览为属性模块）；护甲下拉描述列出防御 / 攻击加成 / 移速影响；行文本有效移速；存档 `armor.arms`。
6. 验证：增量单测 + 全量 `pnpm test` + `pnpm test:e2e character_equipment.spec.ts` + `pnpm build`。

---

## 八、测试覆盖清单

| 层级 | 文件 | 断言要点 |
|------|------|----------|
| 单测 | `combat/damage.test.ts` | 修饰器先结算、防御按类别生效、最小 1 保底、亚 1 点伤害不被放大、`baseAmount` 不变、无 `defense` 时行为与旧版一致 |
| 单测 | `armor/catalog.test.ts` | 全部预设槽位合法、防御/攻击非负、移速乘数为正；四件满配数值护栏（防御 ≤ 9、攻击 ≤ 2）；法师头盔提供魔攻；重甲减速 / 加速鞋增速；`resolveArmorLoadout` 未知 id/槽位错配 → 空槽；`totalDefenseOf` / `totalAttackOf` / `totalMoveSpeedOf` 汇总 |
| 单测 | `armor/limb_catalog.test.ts` | 肢体预设 id/槽位/种族合法、每槽含三族；单件数值护栏；种族倾向；`resolveLimbLoadout` 未知 id / 槽位错配 → 空槽、空/undefined → 空；护甲 + 肢体合并汇总、不传肢体向后兼容 |
| 单测 | `appearance/limb_mesh.test.ts` | 三族在全部肢体关节生成部件、cleanup 清空；未知关节空；骷髅 < 精灵 < 兽人粗壮度；纵向对齐不沉地；阵营调色板改变材质颜色；头部主块带种族脸部 map 且三族各异；头部含种族特征几何（部件数 > 主块、兽人獠牙前伸） |
| 单测 | `appearance/mesh_builder.test.ts` | `trackMaterial` / `trackTexture` 登记外部资源，`dispose` 一并释放 |
| 单测 | `weapon/melee_weapon.test.ts` / `ranged_weapon.test.ts` | 每个预设声明了合法 `damageType`；法杖 / 魔杖为 `magic` |
| 单测 | `entity/character/combat/melee_executor.test.ts` / `ranged_executor.test.ts` | 物理防御减免近战；魔法防御减免法杖弹丸、物理防御不减免；攻击加成按武器类别匹配计入（不匹配不参与）；爆炸继承类别与加成 |
| 单测 | `combat/explosion.test.ts` | `damageType` 参数生效、目标防御参与结算 |
| 单测 | `appearance/mesh_builder.test.ts` | 几何工厂类型、`add` 组装（位置 / 旋转 / 阴影）、`faceBox` 六面材质、`dispose` 清空 group、实例隔离 |
| 单测 | `appearance/armor_mesh.test.ts` | 各槽位部件挂到正确关节（含臂部 / 靴白名单）、尺寸外扩大于身体部件、脚尖条前伸、`cleanup` 释放几何/材质；`hideBodyParts` 不影响几何；身体部位 → 关节映射完备（指向预设骨架关节） |
| 单测 | `state_machine/machine.test.ts` | 装备移速乘数生效：walking 速度 = 基础 × 乘数 |
| 单测 | `save_load/validation.test.ts` | 旧档缺 `armor`/`defense` 回退默认；非法值回退；armor 含四槽位 roundtrip |
| 单测 | `physics/panel_info.test.ts` | `add()` 带护甲时防御 / 攻击加成 / 移速乘数正确；未知护甲 id 不抛错；行文本 def 与有效移速格式；换装不残留外观部件；`hideBodyParts` 装备隐藏 / 卸下还原（靴只隐藏小腿、大腿保持可见）；肢体装备顶替人类部位并计入数值、卸下还原；护甲与肢体顶替互不干扰 |
| e2e | `e2e/character_equipment.spec.ts` | 编辑模式生成角色 → 面板选择护甲 / 基础防御 / 肢体 → 防御、攻击加成与有效移速预览及列表行同步更新 |

---

## 九、风险与陷阱

- **必填 `damageType` 是刻意的**：新增伤害路径漏填直接编译失败；不要为了让旧测试通过改成可选。
- **固定减伤 + 最小 1**：满配重甲会让轻武器只剩 1 点伤害，这是公式取舍；数值护栏为四件满配逐类别防御 ≤ 9、单件攻击加成 ≤ 2，超限需先调整公式而非默默调数值。
- **攻击加成结算位置**：在攻击侧、`DamageEvent` 生成之前并入伤害（近战先加后乘段倍率；远程并入子弹伤害、爆炸继承）；不要在 `applyDamage` 内重复加攻击。
- **防御结算位置**：只在 `applyDamage` 内、修饰器之后执行一次；禁止另建一处减伤（重复减免 / 顺序漂移）。
- **移速唯一入口**：状态机读取有效移速必须走 `moveSpeedOf(entity)`；面板 `config.speed` 仍是基础值（存档持久化），不要在其中预乘装备系数（换装会漂移）。
- **护甲纯视觉**：只挂外观 Group，不建碰撞体、不进 `getMeshes()`、不影响受击箱与 AI 感知；`PAD` 外扩不可过大导致穿模。
- **`hideBodyParts` 顶替**：只隐藏对应部位的基础部件，卸下 / 换装必须还原（`removeArmor` 统一恢复原始可见性，同一部件只备份一次）；部位名用 `ARMOR_BODY_PARTS` 语义名，禁止在护甲领域数据里写死关节 id（映射由 `armor_mesh.ts` 的 `ARMOR_BODY_PART_JOINTS` 持有）；浅覆盖件不要声明，否则会露出底下空缺。
- **存档容错**：未知护甲 id、槽位与 id 不符、`defense` 非对象都必须回退默认且不抛错；旧档（v3 及更早）加载后等价于零防御空护甲、移速乘数 1。
- **模型生命周期**：护甲几何 / 材质必须纳入 `model.dispose` 与换装清理，避免泄漏；护甲是关节子节点，不要写入骨骼姿态轨道（动画桥接只写被动画层覆盖的关节，互不冲突）。
- **面板回显与提交对称**：下拉空值 = 空槽；`refreshFullConfig` 与 `onApply` 的字段集合必须一致，防止只改一项清空其余槽位。

---

## 十、后续扩展（非本期）

- **元素类别**：在 `DAMAGE_TYPES` 追加 `fire` / `thunder` 等，`Record` 类型会让所有护甲预设的防御 / 攻击档案在编译期提醒补齐。
- **套装加成 / 护甲耐久 / 品质与掉落**：在 `character/armor/` 领域层扩展，不动伤害链路。
- **基础攻击力 / 增益状态**：当前攻击加成仅有装备来源；若加入角色基础攻击或临时增益，扩展 `setCombatEquipment` 的入参与 `attackBonus` 汇总即可。
- **AI 目标选择**：AI 可读取目标 `combat.defense` / `moveSpeedMultiplier` 选择有效武器与追击策略（当前 AI 不感知装备，行为不变）。
- **展示模式护甲**：展示台当前走 `createCharacterModel` 但不装配护甲，可按展示脚本配置装备。
- **击退与格挡**：护甲未来可声明击退抗性；本期仅固定减伤与攻击/移速修正。
