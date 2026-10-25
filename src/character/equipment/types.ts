import type {DamageTypeProfile} from '../combat/damage_type.ts'
import type {StringLocaleKey} from '../../i18n/index.ts'
import type {ArmorMeshConfig, LimbMeshConfig} from './mesh_config.ts'
import type {WeaponMeshConfig} from '../weapon/mesh_config.ts'
import type {CollisionCategory} from '../../physics/collision_category.ts'
import type {HurtShape} from '../hurt_blocks.ts'

/**
 * 装备领域契约：装备影响角色数值（state）、外观（appearance），并可通过声明式数组
 * **扩展**碰撞箱与受击箱；不得增删骨骼节点、修改关节层级或动画。
 * 挂载点只是骨骼节点引用；槽位是游戏层限制，不要求槽位与特定骨骼节点一一对应。
 */

/** 三维坐标（装备局部偏移 / 旋转等） */
export interface EquipVec3 {
    readonly x: number
    readonly y: number
    readonly z: number
}

/**
 * 单骨骼节点挂载规格：每个关节独立声明模型与局部偏移 / 旋转。
 * `mesh` 允许同一件装备在不同关节使用不同外观配方。
 */
export interface EquipmentMountSpec<M> {
    /** 目标骨骼节点 id（必须属于对应槽位的 mountJointIds 白名单） */
    readonly jointId: string
    /** 该关节上的装备模型配方 */
    readonly mesh: M
    /** 相对关节局部的坐标偏移（缺省 0） */
    readonly offset?: EquipVec3
    /** 相对关节局部的欧拉角旋转（弧度，XYZ；缺省 0） */
    readonly rotation?: EquipVec3
    /** 相对关节局部的缩放（缺省 1） */
    readonly scale?: EquipVec3
}

/** 装备扩展碰撞体形状（与体形 colliderLayout 的盒/胶囊保持一致） */
export type EquipmentColliderShape =
    | {readonly kind: 'box'; readonly half: EquipVec3}
    | {readonly kind: 'capsule'; readonly radius: number; readonly halfHeight: number}

/** 装备扩展碰撞体：随绑定骨骼节点同步，追加到角色碰撞体列表 */
export interface EquipmentColliderSpec {
    readonly jointId: string
    readonly shape: EquipmentColliderShape
    readonly offset?: EquipVec3
    readonly rotation?: EquipVec3
    /** 碰撞类别（缺省 character；必须显式标注以免被解析为 ground） */
    readonly category?: CollisionCategory
}

/** 装备扩展受击箱：随绑定骨骼节点世界化，追加到角色受击块列表 */
export interface EquipmentHurtBoxSpec {
    readonly jointId: string
    readonly shape: HurtShape
    readonly offset?: EquipVec3
    readonly rotation?: EquipVec3
    /** 稳定 id（缺省自动生成 equip:<pieceId>:<index>） */
    readonly id?: string
}

export const EQUIP_KINDS = ['limb', 'weapon', 'armor'] as const
export type EquipKind = typeof EQUIP_KINDS[number]

/** 槽位定义：`kind` + 体形自定义 `bodyPart` + 可挂载骨骼节点 */
export interface EquipSlotDef {
    readonly kind: EquipKind
    /** 部位 id（体形自定义：head / chest / main_hand / claw / wing_claw / breath …） */
    readonly bodyPart: string
    /** 该槽位可挂载的骨骼节点（可多个；仅作外观挂载引用） */
    readonly mountJointIds: readonly string[]
    /** 槽位本地化名键（缺省由 kind + bodyPart 推导） */
    readonly nameKey?: StringLocaleKey
}

/** 槽位键：`kind:bodyPart`（如 `weapon:wing_claw`） */
export type EquipSlotKey = `${EquipKind}:${string}`

export const equipSlotKey = (kind: EquipKind, bodyPart: string): EquipSlotKey => `${kind}:${bodyPart}`

export const isEquipKind = (value: string): value is EquipKind =>
    (EQUIP_KINDS as readonly string[]).includes(value)

export interface ParsedEquipSlotKey {
    readonly kind: EquipKind
    readonly bodyPart: string
}

/** 解析槽位键；非法键返回 undefined（存档 / UI 输入容错） */
export const parseEquipSlotKey = (key: string): ParsedEquipSlotKey | undefined => {
    const separator = key.indexOf(':')
    if (separator <= 0) return undefined
    const kind = key.slice(0, separator)
    const bodyPart = key.slice(separator + 1)
    if (bodyPart.length === 0 || !isEquipKind(kind)) return undefined
    return {kind, bodyPart}
}

/** 装备数值契约（护甲 / 肢体 / 武器共用汇总口径） */
export interface EquipmentStats {
    /** 逐攻击类别固定减伤 */
    readonly defense: DamageTypeProfile
    /** 逐攻击类别攻击加成（仅在与武器攻击类别匹配时计入伤害） */
    readonly attack: DamageTypeProfile
    /** 移速乘数（1 = 无修正；多件装备相乘） */
    readonly moveSpeedMultiplier: number
    /** 韧性加成（缺省 0） */
    readonly poise?: number
}

/** 装备外观配方联合（具体构建器由拥有该体形的 appearance 分包实现） */
export type EquipmentVisual = WeaponMeshConfig | ArmorMeshConfig | LimbMeshConfig

/**
 * 单件装备定义（领域数据）：
 * - `kind` / `slot` 声明它属于哪类槽位与部位；
 * - `allowedBodyFormIds` 声明允许装备的体形（空 = 全部体形）；
 * - `stats` 为数值契约，`mesh` 为外观配方。
 */
/**
 * 装备模组：同模组共享**同一套骨骼挂载配置**（槽位 + mountJointIds），
 * 模组内的单件只声明数值与外观差异。槽位是游戏层限制，模组是装配层批量化单位。
 */
export interface EquipmentModuleDef<S extends string = string> {
    /** 模组 id（体形内稳定唯一） */
    readonly id: string
    readonly kind: EquipKind
    /** 所属槽位 bodyPart（与 `EquipSlotDef.bodyPart` 一致） */
    readonly slot: S
    /** 该模组全部装备共享的骨骼挂载节点 */
    readonly mountJointIds: readonly string[]
    /** 模组本地化名键（缺省回退槽位名） */
    readonly nameKey?: StringLocaleKey
    /** 模组内装备 id（只作目录校验 / 面板分组，防止空模组） */
    readonly pieceIds: readonly string[]
}

export interface EquipmentDef<S extends string = string, M = EquipmentVisual> extends EquipmentStats {
    /** 装备 id（目录键，存档持久化） */
    readonly id: string
    /** 中文名（面板 / 提示） */
    readonly name: string
    /** 名称本地化键（缺省回退 `name`） */
    readonly nameKey?: StringLocaleKey
    readonly kind: EquipKind
    /** 部位 id（槽位键的 bodyPart 部分） */
    readonly slot: S
    /** 允许装备该物品的体形 id（空 = 全部体形） */
    readonly allowedBodyFormIds: readonly string[]
    /** 外观部件配方（未声明 `mounts` 时作为每个挂载关节的默认模型） */
    readonly mesh: M
    /** 逐骨骼节点挂载配置；缺省 = 槽位 mountJointIds 各关节使用同一 `mesh`、零偏移/旋转 */
    readonly mounts?: readonly EquipmentMountSpec<M>[]
    /** 扩展碰撞体（逐项绑定骨骼节点；现有装备为空数组） */
    readonly colliders?: readonly EquipmentColliderSpec[]
    /** 扩展受击箱（逐项绑定骨骼节点；现有装备为空数组） */
    readonly hurtBoxes?: readonly EquipmentHurtBoxSpec[]
}

/** 按槽位分组的装备状态（嵌套 limb / weapon / armor；槽位键 = kind:bodyPart） */
export interface EquipmentState {
    readonly limb: Readonly<Record<string, string>>
    readonly weapon: Readonly<Record<string, string>>
    readonly armor: Readonly<Record<string, string>>
}

export const EMPTY_EQUIPMENT_STATE: EquipmentState = {limb: {}, weapon: {}, armor: {}}

/** 取某槽位的物品 id（未装备 = undefined） */
export const equipmentAt = (state: EquipmentState, kind: EquipKind, bodyPart: string): string | undefined =>
    state[kind][bodyPart]

/** 返回替换某槽位后的新装备状态（itemId = undefined 表示清空该槽） */
export const withEquipmentAt = (
    state: EquipmentState,
    kind: EquipKind,
    bodyPart: string,
    itemId: string | undefined,
): EquipmentState => {
    const next: Record<string, string> = {...state[kind]}
    if (itemId === undefined) delete next[bodyPart]
    else next[bodyPart] = itemId
    return {...state, [kind]: next}
}

/** 展平装备状态为 (槽位键, 物品 id) 列表（存档 / 面板 / 校验用） */
export const equipmentEntriesOf = (state: EquipmentState): ReadonlyArray<{
    readonly key: EquipSlotKey
    readonly kind: EquipKind
    readonly bodyPart: string
    readonly itemId: string
}> => {
    const out: Array<{key: EquipSlotKey; kind: EquipKind; bodyPart: string; itemId: string}> = []
    for (const kind of EQUIP_KINDS) {
        for (const [bodyPart, itemId] of Object.entries(state[kind])) {
            out.push({key: equipSlotKey(kind, bodyPart), kind, bodyPart, itemId})
        }
    }
    return out
}

/** 部位 id → 本地化名键（跨体形共用；未知部位返回 undefined，显示层回退部位原文） */
const BODY_PART_LABEL_KEYS: Readonly<Record<string, StringLocaleKey>> = {
    main_hand: 'equip_slot.main_hand',
    off_hand: 'equip_slot.off_hand',
    head: 'equip_slot.head',
    chest: 'equip_slot.chest',
    arms: 'equip_slot.arms',
    legs: 'equip_slot.legs',
    body: 'limb_slot.body',
    torso: 'equip_slot.torso',
    tail: 'equip_slot.tail',
    claw: 'equip_slot.claw',
    hooves: 'equip_slot.hooves',
    wing_claw: 'equip_slot.wing_claw',
    wing: 'equip_slot.wing',
    breath: 'equip_slot.breath',
}

export const equipBodyPartLabelKey = (bodyPart: string): StringLocaleKey | undefined =>
    BODY_PART_LABEL_KEYS[bodyPart]
