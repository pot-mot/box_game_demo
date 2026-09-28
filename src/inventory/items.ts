import type {EquipSlot} from './types.ts'

export const ITEM_CATEGORIES = ['weapon', 'armor', 'consumable', 'material', 'key'] as const
export type ItemCategory = typeof ITEM_CATEGORIES[number]

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
    weapon: '武器',
    armor: '护甲',
    consumable: '消耗品',
    material: '材料',
    key: '关键物品',
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
    weapon('weapon_dual_axe', '双斧', ['##', '##'], 'dual_axe', '可双持战斧'),
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