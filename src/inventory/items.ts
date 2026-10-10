import type {EquipSlot} from './types.ts'
import {translate, type StringLocaleKey} from '../i18n/index.ts'

export const ITEM_CATEGORIES = ['weapon', 'armor', 'consumable', 'material', 'key'] as const
export type ItemCategory = typeof ITEM_CATEGORIES[number]

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, StringLocaleKey> = {
    weapon: 'item_category.weapon',
    armor: 'item_category.armor',
    consumable: 'item_category.consumable',
    material: 'item_category.material',
    key: 'item_category.key',
}

/**
 * 物品定义：`shape` 为俄罗斯方块形状（每行一个字符串，`#` 为占格；行数 = 高度，最长行 = 宽度）。
 * `weaponId` / `armorId` 指向既有武器模型 / 护甲预设，实现背包装备。
 */
export interface ItemDef {
    readonly id: string
    readonly name: string
    readonly category: ItemCategory
    readonly shape: readonly string[]
    readonly maxStack: number
    readonly weaponId?: string
    readonly armorId?: string
    readonly equipSlot?: EquipSlot
    readonly dropSize: readonly [number, number, number]
    readonly description: string
}

const weapon = (id: string, name: string, shape: readonly string[], weaponId: string, damage: string): ItemDef => ({
    id,
    name,
    category: 'weapon',
    shape,
    maxStack: 1,
    weaponId,
    equipSlot: 'main_hand',
    dropSize: [0.35, 0.35, 0.9],
    description: `${name}（${damage}）`,
})

const armor = (id: string, name: string, shape: readonly string[], armorId: string, slot: EquipSlot, effect: string): ItemDef => ({
    id,
    name,
    category: 'armor',
    shape,
    maxStack: 1,
    armorId,
    equipSlot: slot,
    dropSize: [0.35, 0.35, 0.35],
    description: `${name}（${effect}）`,
})

/** 物品目录（生产物品；未知 defId 由运行时丢弃） */
export const ITEM_DEFS: readonly ItemDef[] = [
    /* ── 武器 ── */
    weapon('weapon_short_sword', '短剑', ['#', '#', '#'], 'short_sword', '轻快短兵'),
    weapon('weapon_long_sword', '长剑', ['#', '#', '#', '#'], 'long_sword', '均衡单手剑'),
    weapon('weapon_heavy_sword', '巨剑', ['##', '##', '##'], 'heavy_sword', '沉重双手剑'),
    weapon('weapon_spear', '长枪', ['#', '#', '#', '#', '#'], 'spear', '突刺长柄'),
    weapon('weapon_war_hammer', '战锤', ['##', '##', '.#'], 'war_hammer', '破甲重锤'),
    weapon('weapon_dual_axe', '战斧', ['##', '##'], 'dual_axe', '可双持'),
    weapon('weapon_longbow', '长弓', ['#.', '##', '.#'], 'longbow', '远程弓箭'),
    weapon('weapon_crossbow', '弩', ['##', '.#'], 'crossbow', '远程弩矢'),
    weapon('weapon_staff', '法杖', ['#', '#', '#'], 'staff', '施放魔法'),
    /* ── 护甲 ── */
    armor('armor_cloth_cap', '布帽', ['#'], 'cloth_cap', 'head', '轻便'),
    armor('armor_iron_helmet', '铁盔', ['#'], 'iron_helmet', 'head', '物理防御'),
    armor('armor_cloth_vest', '布衣', ['##', '##'], 'cloth_vest', 'chest', '轻便'),
    armor('armor_iron_plate', '铁板甲', ['##', '##'], 'iron_plate', 'chest', '物理防御'),
    armor('armor_leather_armor', '皮甲', ['##', '##'], 'leather_armor', 'chest', '均衡防御'),
    armor('armor_iron_bracers', '铁护腕', ['#', '#'], 'iron_bracers', 'arms', '物理防御'),
    armor('armor_cloth_pants', '布裤', ['#', '#'], 'cloth_pants', 'legs', '轻便'),
    armor('armor_iron_greaves', '铁护胫', ['#', '#'], 'iron_greaves', 'legs', '物理防御'),
    /* ── 消耗品 / 材料 ── */
    {
        id: 'consumable_flask', name: '恢复药', category: 'consumable', shape: ['#'], maxStack: 20,
        dropSize: [0.25, 0.25, 0.25], description: '饮用后恢复生命',
    },
    {
        id: 'material_stone', name: '石块', category: 'material', shape: ['#'], maxStack: 99,
        dropSize: [0.25, 0.25, 0.25], description: '常见建材',
    },
    {
        id: 'key_rusted', name: '锈蚀钥匙', category: 'key', shape: ['#'], maxStack: 1,
        dropSize: [0.2, 0.2, 0.2], description: '可以开启某处锁闭的门',
    },
] as const

export const findItemDef = (id: string | undefined): ItemDef | undefined =>
    id === undefined ? undefined : ITEM_DEFS.find(def => def.id === id)

export const isKnownItemId = (id: string): boolean => findItemDef(id) !== undefined

/** 物品 id → 本地化名称键（未知 id 回退数据 `name`） */
const ITEM_NAME_KEYS: Record<string, StringLocaleKey> = {
    weapon_short_sword: 'item.weapon_short_sword.name',
    weapon_long_sword: 'item.weapon_long_sword.name',
    weapon_heavy_sword: 'item.weapon_heavy_sword.name',
    weapon_spear: 'item.weapon_spear.name',
    weapon_war_hammer: 'item.weapon_war_hammer.name',
    weapon_dual_axe: 'item.weapon_dual_axe.name',
    weapon_longbow: 'item.weapon_longbow.name',
    weapon_crossbow: 'item.weapon_crossbow.name',
    weapon_staff: 'item.weapon_staff.name',
    armor_cloth_cap: 'item.armor_cloth_cap.name',
    armor_iron_helmet: 'item.armor_iron_helmet.name',
    armor_cloth_vest: 'item.armor_cloth_vest.name',
    armor_iron_plate: 'item.armor_iron_plate.name',
    armor_leather_armor: 'item.armor_leather_armor.name',
    armor_iron_bracers: 'item.armor_iron_bracers.name',
    armor_cloth_pants: 'item.armor_cloth_pants.name',
    armor_iron_greaves: 'item.armor_iron_greaves.name',
    consumable_flask: 'item.consumable_flask.name',
    material_stone: 'item.material_stone.name',
    key_rusted: 'item.key_rusted.name',
}

/** 物品 id → 本地化描述键（未知 id 回退数据 `description`） */
const ITEM_DESC_KEYS: Record<string, StringLocaleKey> = {
    weapon_short_sword: 'item.weapon_short_sword.desc',
    weapon_long_sword: 'item.weapon_long_sword.desc',
    weapon_heavy_sword: 'item.weapon_heavy_sword.desc',
    weapon_spear: 'item.weapon_spear.desc',
    weapon_war_hammer: 'item.weapon_war_hammer.desc',
    weapon_dual_axe: 'item.weapon_dual_axe.desc',
    weapon_longbow: 'item.weapon_longbow.desc',
    weapon_crossbow: 'item.weapon_crossbow.desc',
    weapon_staff: 'item.weapon_staff.desc',
    armor_cloth_cap: 'item.armor_cloth_cap.desc',
    armor_iron_helmet: 'item.armor_iron_helmet.desc',
    armor_cloth_vest: 'item.armor_cloth_vest.desc',
    armor_iron_plate: 'item.armor_iron_plate.desc',
    armor_leather_armor: 'item.armor_leather_armor.desc',
    armor_iron_bracers: 'item.armor_iron_bracers.desc',
    armor_cloth_pants: 'item.armor_cloth_pants.desc',
    armor_iron_greaves: 'item.armor_iron_greaves.desc',
    consumable_flask: 'item.consumable_flask.desc',
    material_stone: 'item.material_stone.desc',
    key_rusted: 'item.key_rusted.desc',
}

/** 物品本地化显示名（未知 id 回退数据 `name`，未知 def 回退 id 文本由调用方处理） */
export const itemDisplayName = (def: ItemDef): string => {
    const key = ITEM_NAME_KEYS[def.id]
    return key === undefined ? def.name : translate(key)
}

/** 物品本地化描述（未知 id 回退数据 `description`） */
export const itemDisplayDescription = (def: ItemDef): string => {
    const key = ITEM_DESC_KEYS[def.id]
    return key === undefined ? def.description : translate(key)
}