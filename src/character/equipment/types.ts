import type {DamageTypeProfile} from '../combat/damage_type.ts'
import type {StringLocaleKey} from '../../i18n/index.ts'
import type {ArmorMeshConfig, LimbMeshConfig} from './mesh_config.ts'
import type {WeaponMeshConfig} from '../weapon/mesh_config.ts'

/**
 * 装备领域契约：装备只影响角色数值（state）与外观（appearance），
 * 不修改骨骼节点、关节或动画。挂载点只是骨骼节点引用；槽位是游戏层限制，
 * 不要求槽位与特定骨骼节点一一对应。
 */

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
    /** 外观部件配方 */
    readonly mesh: M
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
