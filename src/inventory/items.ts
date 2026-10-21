import type {EquipSlot} from './types.ts'
import type {BoxPresetId} from '../types/boxPreset.ts'
import type {AreaPresetId} from '../types/areaPreset.ts'
import {translate, type StringLocaleKey} from '../i18n/index.ts'
import type {IconName} from '../ui/icons/sprite.ts'

export const ITEM_CATEGORIES = ['weapon', 'armor', 'breath', 'block', 'consumable', 'material', 'key'] as const
export type ItemCategory = typeof ITEM_CATEGORIES[number]

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, StringLocaleKey> = {
    weapon: 'item_category.weapon',
    armor: 'item_category.armor',
    breath: 'item_category.breath',
    block: 'item_category.block',
    consumable: 'item_category.consumable',
    material: 'item_category.material',
    key: 'item_category.key',
}

/**
 * 物品定义：`shape` 为俄罗斯方块形状（每行一个字符串，`#` 为占格；行数 = 高度，最长行 = 宽度）。
 * `weaponId` / `armorId` 指向既有武器模型 / 护甲预设，实现背包装备；
 * `blockType` 为放置时生成的实体类型（箱子恒为 `box`，区域为 `area`），`boxPreset` 为箱子特性预设，
 * `areaPreset` 为区域材质 + 场预设。
 */
export interface ItemDef {
    readonly id: string
    readonly name: string
    readonly category: ItemCategory
    /** 背包 / 图鉴呈现用图标（`ui/icons` sprite 中的图标名，逐物品专属） */
    readonly icon: IconName
    readonly shape: readonly string[]
    readonly maxStack: number
    readonly weaponId?: string
    readonly armorId?: string
    readonly breathModuleId?: string
    /** 仅允许该体形装备（如吐息物品只允许 wyvern） */
    readonly equipBodyFormId?: string
    readonly equipSlot?: EquipSlot
    /** 方块物品放置时生成的实体类型（`box` / `area`；仅 `block` 类别） */
    readonly blockType?: string
    /** 箱子特性预设（仅 `blockType === 'box'` 的方块物品） */
    readonly boxPreset?: BoxPresetId
    /** 区域材质 + 场预设（仅 `blockType === 'area'` 的方块物品） */
    readonly areaPreset?: AreaPresetId
    readonly dropSize: readonly [number, number, number]
    readonly description: string
}

const weapon = (id: string, name: string, shape: readonly string[], weaponId: string, damage: string, icon: IconName): ItemDef => ({
    id,
    name,
    category: 'weapon',
    icon,
    shape,
    maxStack: 1,
    weaponId,
    equipSlot: 'main_hand',
    dropSize: [0.35, 0.35, 0.9],
    description: `${name}（${damage}）`,
})

const armor = (id: string, name: string, shape: readonly string[], armorId: string, slot: EquipSlot, effect: string, icon: IconName): ItemDef => ({
    id,
    name,
    category: 'armor',
    icon,
    shape,
    maxStack: 1,
    armorId,
    equipSlot: slot,
    dropSize: [0.35, 0.35, 0.35],
    description: `${name}（${effect}）`,
})

const breath = (
    id: string,
    name: string,
    shape: readonly string[],
    breathModuleId: string,
    effect: string,
    icon: IconName,
): ItemDef => ({
    id,
    name,
    category: 'breath',
    icon,
    shape,
    maxStack: 1,
    breathModuleId,
    equipSlot: 'breath',
    equipBodyFormId: 'wyvern',
    dropSize: [0.28, 0.28, 0.28],
    description: `${name}（${effect}）`,
})

const block = (
    id: string,
    name: string,
    shape: readonly string[],
    blockType: string,
    description: string,
    icon: IconName,
    preset?: {readonly box?: BoxPresetId; readonly area?: AreaPresetId},
): ItemDef => ({
    id,
    name,
    category: 'block',
    icon,
    shape,
    maxStack: 99,
    blockType,
    boxPreset: preset?.box,
    areaPreset: preset?.area,
    dropSize: [0.4, 0.4, 0.4],
    description: `${name}（${description}）`,
})

/**
 * 物品目录（生产物品；未知 defId 由运行时丢弃）。
 * 覆盖**全部武器模型**（近战 6 + 盾牌 3 + 远程 9）、**全部护甲预设**（27）与**全部方块实体**（5 类箱子 + 水方块）；
 * 由 `items.test.ts` 对照武器 / 护甲目录与实体类型锁定完整性，新增武器 / 护甲 / 方块须同步补条目。
 */
export const ITEM_DEFS: readonly ItemDef[] = [
    /* ── 近战武器 ── */
    weapon('weapon_short_sword', '短剑', ['#', '#', '#'], 'short_sword', '轻快短兵', 'item-short-sword'),
    weapon('weapon_long_sword', '长剑', ['#', '#', '#', '#'], 'long_sword', '均衡单手剑', 'item-long-sword'),
    weapon('weapon_heavy_sword', '巨剑', ['##', '##', '##'], 'heavy_sword', '沉重双手剑', 'item-heavy-sword'),
    weapon('weapon_spear', '长枪', ['#', '#', '#', '#', '#'], 'spear', '突刺长柄', 'item-spear'),
    weapon('weapon_war_hammer', '战锤', ['##', '##', '.#'], 'war_hammer', '破甲重锤', 'item-war-hammer'),
    weapon('weapon_dual_axe', '战斧', ['##', '##'], 'dual_axe', '可双持', 'item-dual-axe'),
    weapon('weapon_shield_small', '小盾', ['##', '##', '.#'], 'shield_small', '轻装盾击 / 格挡', 'item-shield-small'),
    weapon('weapon_shield_medium', '中盾', ['##', '##', '##'], 'shield_medium', '均衡盾击 / 格挡', 'item-shield-medium'),
    weapon('weapon_shield_large', '大盾', ['###', '###', '.#.'], 'shield_large', '重型盾击 / 格挡', 'item-shield-large'),
    /* ── 远程武器 ── */
    weapon('weapon_longbow', '长弓', ['#.', '##', '.#'], 'longbow', '远程弓箭', 'item-longbow'),
    weapon('weapon_crossbow', '弩', ['##', '.#'], 'crossbow', '远程弩矢', 'item-crossbow'),
    weapon('weapon_shotgun', '霰弹枪', ['##', '##', '#.'], 'shotgun', '近距散射', 'item-shotgun'),
    weapon('weapon_staff', '法杖', ['#', '#', '#'], 'staff', '施放魔法', 'item-staff'),
    weapon('weapon_magic_wand', '魔杖', ['#', '#'], 'magic_wand', '蓄能法术', 'item-magic-wand'),
    weapon('weapon_throwing_axe', '飞斧', ['##', '##'], 'throwing_axe', '投掷兵器', 'item-throwing-axe'),
    weapon('weapon_grenade', '手雷', ['#'], 'grenade', '范围爆炸', 'item-grenade'),
    weapon('weapon_molotov', '燃烧瓶', ['#', '#'], 'molotov', '范围灼烧', 'item-molotov'),
    weapon('weapon_throwing_dart', '飞镖', ['#', '#'], 'throwing_dart', '轻巧暗器', 'item-throwing-dart'),
    /* ── 龙吐息（独立 breath 装备槽，仅 wyvern 可装备） ── */
    breath('item_breath_fireball', '火球吐息', ['##', '##'], 'breath_fireball', '抛射火球并爆炸', 'item-breath-fireball'),
    breath('item_breath_lightning', '雷电吐息', ['#.', '##', '.#'], 'breath_lightning', '高速弹与链式传导', 'item-breath-lightning'),
    breath('item_breath_laser', '激光吐息', ['###', '...', '###'], 'breath_laser', '高速穿透光束', 'item-breath-laser'),
    /* ── 护甲 ── */
    armor('armor_cloth_cap', '布帽', ['#'], 'cloth_cap', 'head', '轻便', 'item-cloth-cap'),
    armor('armor_iron_helmet', '铁盔', ['#'], 'iron_helmet', 'head', '物理防御', 'item-iron-helmet'),
    armor('armor_mage_hood', '法师兜帽', ['#'], 'mage_hood', 'head', '魔法强化', 'item-mage-hood'),
    armor('armor_cloth_vest', '布衣', ['##', '##'], 'cloth_vest', 'chest', '轻便', 'item-cloth-vest'),
    armor('armor_iron_plate', '铁板甲', ['##', '##'], 'iron_plate', 'chest', '物理防御', 'item-iron-plate'),
    armor('armor_leather_armor', '皮甲', ['##', '##'], 'leather_armor', 'chest', '均衡防御', 'item-leather-armor'),
    armor('armor_mage_robe', '法袍', ['##', '##'], 'mage_robe', 'chest', '魔法防御', 'item-mage-robe'),
    armor('armor_scale_mail', '鳞甲', ['##', '##'], 'scale_mail', 'chest', '厚重复合甲', 'item-scale-mail'),
    armor('armor_cloth_bracers', '布护腕', ['#', '#'], 'cloth_bracers', 'arms', '轻便', 'item-cloth-bracers'),
    armor('armor_iron_bracers', '铁护腕', ['#', '#'], 'iron_bracers', 'arms', '物理防御', 'item-iron-bracers'),
    armor('armor_battle_bracers', '战臂甲', ['#', '#'], 'battle_bracers', 'arms', '物理攻击', 'item-battle-bracers'),
    armor('armor_mage_wraps', '法印护腕', ['#', '#'], 'mage_wraps', 'arms', '魔法强化', 'item-mage-wraps'),
    armor('armor_cloth_pants', '布裤', ['#', '#'], 'cloth_pants', 'legs', '轻便', 'item-cloth-pants'),
    armor('armor_iron_greaves', '铁护胫', ['#', '#'], 'iron_greaves', 'legs', '物理防御', 'item-iron-greaves'),
    armor('armor_mage_leggings', '法师护腿', ['#', '#'], 'mage_leggings', 'legs', '魔法防御', 'item-mage-leggings'),
    armor('armor_swift_boots', '疾行靴', ['#', '#'], 'swift_boots', 'legs', '提升移速', 'item-swift-boots'),
    armor('armor_wind_boots', '疾风靴', ['#', '#'], 'wind_boots', 'legs', '大幅提升移速', 'item-wind-boots'),
    armor('armor_leather_cap', '皮帽', ['#'], 'leather_cap', 'head', '物理防御', 'item-leather-cap'),
    armor('armor_leather_bracers', '皮护腕', ['#', '#'], 'leather_bracers', 'arms', '物理防御', 'item-leather-bracers'),
    armor('armor_leather_legs', '皮护腿', ['#', '#'], 'leather_legs', 'legs', '物理防御', 'item-leather-legs'),
    armor('armor_scale_helm', '鳞盔', ['#'], 'scale_helm', 'head', '复合防御', 'item-scale-helm'),
    armor('armor_scale_bracers', '鳞护腕', ['#', '#'], 'scale_bracers', 'arms', '复合防御', 'item-scale-bracers'),
    armor('armor_scale_legs', '鳞护腿', ['#', '#'], 'scale_legs', 'legs', '复合防御', 'item-scale-legs'),
    armor('armor_stone_helm', '石盔', ['#'], 'stone_helm', 'head', '重型防御', 'item-stone-helm'),
    armor('armor_stone_plate', '石胸甲', ['##', '##'], 'stone_plate', 'chest', '重型防御', 'item-stone-plate'),
    armor('armor_stone_bracers', '石护腕', ['#', '#'], 'stone_bracers', 'arms', '重型防御', 'item-stone-bracers'),
    armor('armor_stone_legs', '石护腿', ['#', '#'], 'stone_legs', 'legs', '重型防御', 'item-stone-legs'),
    /* ── 方块 ── */
    block('block_common', '普通方块', ['#'], 'box', '基础物理方块', 'item-block', {box: 'common'}),
    block('block_destruction', '可破坏方块', ['#'], 'box', '受击碎裂', 'item-block-destruction', {box: 'destructible'}),
    block('block_burning', '燃烧方块', ['#'], 'box', '受击燃烧', 'item-block-burning', {box: 'burning'}),
    block('block_magnet', '磁力方块', ['#'], 'box', '吸引金属物', 'item-block-magnet', {box: 'magnet'}),
    block('block_elasticity', '弹性方块', ['#'], 'box', '受力形变', 'item-block-elasticity', {box: 'elastic'}),
    block('block_water', '水方块', ['#'], 'area', '浮力液体', 'item-block-water', {area: 'water'}),
    block('block_air', '风方块', ['#'], 'area', '气流推动', 'item-block-air', {area: 'air'}),
    block('block_force_field', '力场方块', ['#'], 'area', '方向重力', 'item-block-force-field', {area: 'force_field'}),
    /* ── 消耗品 / 材料 / 钥匙 ── */
    {
        id: 'consumable_flask', name: '恢复药', category: 'consumable', icon: 'item-flask', shape: ['#'], maxStack: 20,
        dropSize: [0.25, 0.25, 0.25], description: '饮用后恢复生命',
    },
    {
        id: 'material_stone', name: '石块', category: 'material', icon: 'item-stone', shape: ['#'], maxStack: 99,
        dropSize: [0.25, 0.25, 0.25], description: '常见建材',
    },
    {
        id: 'key_rusted', name: '锈蚀钥匙', category: 'key', icon: 'item-key', shape: ['#'], maxStack: 1,
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
    weapon_shield_small: 'weapon.shield_small',
    weapon_shield_medium: 'weapon.shield_medium',
    weapon_shield_large: 'weapon.shield_large',
    weapon_longbow: 'item.weapon_longbow.name',
    weapon_crossbow: 'item.weapon_crossbow.name',
    weapon_staff: 'item.weapon_staff.name',
    /* 新增武器条目复用武器目录既有名称键，避免重复维护 */
    weapon_shotgun: 'weapon.shotgun',
    weapon_magic_wand: 'weapon.magic_wand',
    weapon_throwing_axe: 'weapon.throwing_axe',
    weapon_grenade: 'weapon.grenade',
    weapon_molotov: 'weapon.molotov',
    weapon_throwing_dart: 'weapon.throwing_dart',
    armor_cloth_cap: 'item.armor_cloth_cap.name',
    armor_iron_helmet: 'item.armor_iron_helmet.name',
    armor_cloth_vest: 'item.armor_cloth_vest.name',
    armor_iron_plate: 'item.armor_iron_plate.name',
    armor_leather_armor: 'item.armor_leather_armor.name',
    armor_iron_bracers: 'item.armor_iron_bracers.name',
    armor_cloth_pants: 'item.armor_cloth_pants.name',
    armor_iron_greaves: 'item.armor_iron_greaves.name',
    /* 新增护甲条目复用护甲目录既有名称键 */
    armor_mage_hood: 'armor.mage_hood',
    armor_mage_robe: 'armor.mage_robe',
    armor_scale_mail: 'armor.scale_mail',
    armor_cloth_bracers: 'armor.cloth_bracers',
    armor_battle_bracers: 'armor.battle_bracers',
    armor_mage_wraps: 'armor.mage_wraps',
    armor_mage_leggings: 'armor.mage_leggings',
    armor_swift_boots: 'armor.swift_boots',
    armor_wind_boots: 'armor.wind_boots',
    /* 龙吐息 */
    item_breath_fireball: 'item.item_breath_fireball.name',
    item_breath_lightning: 'item.item_breath_lightning.name',
    item_breath_laser: 'item.item_breath_laser.name',
    /* 方块 */
    block_common: 'item.block_common.name',
    block_destruction: 'item.block_destruction.name',
    block_burning: 'item.block_burning.name',
    block_magnet: 'item.block_magnet.name',
    block_elasticity: 'item.block_elasticity.name',
    block_water: 'item.block_water.name',
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
    weapon_shield_small: 'item.weapon_generic.desc',
    weapon_shield_medium: 'item.weapon_generic.desc',
    weapon_shield_large: 'item.weapon_generic.desc',
    weapon_longbow: 'item.weapon_longbow.desc',
    weapon_crossbow: 'item.weapon_crossbow.desc',
    weapon_staff: 'item.weapon_staff.desc',
    /* 新增武器 / 护甲共用类别描述键（数值由图鉴详情单独呈现） */
    weapon_shotgun: 'item.weapon_generic.desc',
    weapon_magic_wand: 'item.weapon_generic.desc',
    weapon_throwing_axe: 'item.weapon_generic.desc',
    weapon_grenade: 'item.weapon_generic.desc',
    weapon_molotov: 'item.weapon_generic.desc',
    weapon_throwing_dart: 'item.weapon_generic.desc',
    armor_cloth_cap: 'item.armor_cloth_cap.desc',
    armor_iron_helmet: 'item.armor_iron_helmet.desc',
    armor_cloth_vest: 'item.armor_cloth_vest.desc',
    armor_iron_plate: 'item.armor_iron_plate.desc',
    armor_leather_armor: 'item.armor_leather_armor.desc',
    armor_iron_bracers: 'item.armor_iron_bracers.desc',
    armor_cloth_pants: 'item.armor_cloth_pants.desc',
    armor_iron_greaves: 'item.armor_iron_greaves.desc',
    armor_mage_hood: 'item.armor_generic.desc',
    armor_mage_robe: 'item.armor_generic.desc',
    armor_scale_mail: 'item.armor_generic.desc',
    armor_cloth_bracers: 'item.armor_generic.desc',
    armor_battle_bracers: 'item.armor_generic.desc',
    armor_mage_wraps: 'item.armor_generic.desc',
    armor_mage_leggings: 'item.armor_generic.desc',
    armor_swift_boots: 'item.armor_generic.desc',
    armor_wind_boots: 'item.armor_generic.desc',
    item_breath_fireball: 'item.item_breath_fireball.desc',
    item_breath_lightning: 'item.item_breath_lightning.desc',
    item_breath_laser: 'item.item_breath_laser.desc',
    block_common: 'item.block_common.desc',
    block_destruction: 'item.block_destruction.desc',
    block_burning: 'item.block_burning.desc',
    block_magnet: 'item.block_magnet.desc',
    block_elasticity: 'item.block_elasticity.desc',
    block_water: 'item.block_water.desc',
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