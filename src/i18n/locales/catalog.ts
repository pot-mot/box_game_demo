/**
 * 数据目录文案域（物品目录 / 装备槽位）。
 * 由 `src/i18n/index.ts` 聚合进 `MainLocale`；中文表 `catalogZh`、英文表 `catalogEn` 必须结构一致。
 */
export type CatalogLocale = {
    'item_category.weapon': string
    'item_category.armor': string
    'item_category.consumable': string
    'item_category.material': string
    'item_category.key': string
    'equip_slot.main_hand': string
    'equip_slot.off_hand': string
    'equip_slot.head': string
    'equip_slot.chest': string
    'equip_slot.arms': string
    'equip_slot.legs': string
    'item.weapon_short_sword.name': string
    'item.weapon_short_sword.desc': string
    'item.weapon_long_sword.name': string
    'item.weapon_long_sword.desc': string
    'item.weapon_heavy_sword.name': string
    'item.weapon_heavy_sword.desc': string
    'item.weapon_spear.name': string
    'item.weapon_spear.desc': string
    'item.weapon_war_hammer.name': string
    'item.weapon_war_hammer.desc': string
    'item.weapon_dual_axe.name': string
    'item.weapon_dual_axe.desc': string
    'item.weapon_longbow.name': string
    'item.weapon_longbow.desc': string
    'item.weapon_crossbow.name': string
    'item.weapon_crossbow.desc': string
    'item.weapon_staff.name': string
    'item.weapon_staff.desc': string
    'item.armor_cloth_cap.name': string
    'item.armor_cloth_cap.desc': string
    'item.armor_iron_helmet.name': string
    'item.armor_iron_helmet.desc': string
    'item.armor_cloth_vest.name': string
    'item.armor_cloth_vest.desc': string
    'item.armor_iron_plate.name': string
    'item.armor_iron_plate.desc': string
    'item.armor_leather_armor.name': string
    'item.armor_leather_armor.desc': string
    'item.armor_iron_bracers.name': string
    'item.armor_iron_bracers.desc': string
    'item.armor_cloth_pants.name': string
    'item.armor_cloth_pants.desc': string
    'item.armor_iron_greaves.name': string
    'item.armor_iron_greaves.desc': string
    'item.consumable_flask.name': string
    'item.consumable_flask.desc': string
    'item.material_stone.name': string
    'item.material_stone.desc': string
    'item.key_rusted.name': string
    'item.key_rusted.desc': string
}

export const catalogZh: CatalogLocale = {
    'item_category.weapon': '武器',
    'item_category.armor': '护甲',
    'item_category.consumable': '消耗品',
    'item_category.material': '材料',
    'item_category.key': '关键物品',
    'equip_slot.main_hand': '主手',
    'equip_slot.off_hand': '副手',
    'equip_slot.head': '头部',
    'equip_slot.chest': '躯干',
    'equip_slot.arms': '手臂',
    'equip_slot.legs': '腿部',
    'item.weapon_short_sword.name': '短剑',
    'item.weapon_short_sword.desc': '短剑（轻快短兵）',
    'item.weapon_long_sword.name': '长剑',
    'item.weapon_long_sword.desc': '长剑（均衡单手剑）',
    'item.weapon_heavy_sword.name': '巨剑',
    'item.weapon_heavy_sword.desc': '巨剑（沉重双手剑）',
    'item.weapon_spear.name': '长枪',
    'item.weapon_spear.desc': '长枪（突刺长柄）',
    'item.weapon_war_hammer.name': '战锤',
    'item.weapon_war_hammer.desc': '战锤（破甲重锤）',
    'item.weapon_dual_axe.name': '战斧',
    'item.weapon_dual_axe.desc': '战斧（可双持）',
    'item.weapon_longbow.name': '长弓',
    'item.weapon_longbow.desc': '长弓（远程弓箭）',
    'item.weapon_crossbow.name': '弩',
    'item.weapon_crossbow.desc': '弩（远程弩矢）',
    'item.weapon_staff.name': '法杖',
    'item.weapon_staff.desc': '法杖（施放魔法）',
    'item.armor_cloth_cap.name': '布帽',
    'item.armor_cloth_cap.desc': '布帽（轻便）',
    'item.armor_iron_helmet.name': '铁盔',
    'item.armor_iron_helmet.desc': '铁盔（物理防御）',
    'item.armor_cloth_vest.name': '布衣',
    'item.armor_cloth_vest.desc': '布衣（轻便）',
    'item.armor_iron_plate.name': '铁板甲',
    'item.armor_iron_plate.desc': '铁板甲（物理防御）',
    'item.armor_leather_armor.name': '皮甲',
    'item.armor_leather_armor.desc': '皮甲（均衡防御）',
    'item.armor_iron_bracers.name': '铁护腕',
    'item.armor_iron_bracers.desc': '铁护腕（物理防御）',
    'item.armor_cloth_pants.name': '布裤',
    'item.armor_cloth_pants.desc': '布裤（轻便）',
    'item.armor_iron_greaves.name': '铁护胫',
    'item.armor_iron_greaves.desc': '铁护胫（物理防御）',
    'item.consumable_flask.name': '恢复药',
    'item.consumable_flask.desc': '饮用后恢复生命',
    'item.material_stone.name': '石块',
    'item.material_stone.desc': '常见建材',
    'item.key_rusted.name': '锈蚀钥匙',
    'item.key_rusted.desc': '可以开启某处锁闭的门',
}

export const catalogEn: CatalogLocale = {
    'item_category.weapon': 'Weapon',
    'item_category.armor': 'Armor',
    'item_category.consumable': 'Consumable',
    'item_category.material': 'Material',
    'item_category.key': 'Key Item',
    'equip_slot.main_hand': 'Main Hand',
    'equip_slot.off_hand': 'Off Hand',
    'equip_slot.head': 'Head',
    'equip_slot.chest': 'Chest',
    'equip_slot.arms': 'Arms',
    'equip_slot.legs': 'Legs',
    'item.weapon_short_sword.name': 'Short Sword',
    'item.weapon_short_sword.desc': 'Short Sword (light and quick)',
    'item.weapon_long_sword.name': 'Long Sword',
    'item.weapon_long_sword.desc': 'Long Sword (balanced one-hander)',
    'item.weapon_heavy_sword.name': 'Heavy Sword',
    'item.weapon_heavy_sword.desc': 'Heavy Sword (heavy two-hander)',
    'item.weapon_spear.name': 'Spear',
    'item.weapon_spear.desc': 'Spear (thrusting polearm)',
    'item.weapon_war_hammer.name': 'War Hammer',
    'item.weapon_war_hammer.desc': 'War Hammer (armor-breaking)',
    'item.weapon_dual_axe.name': 'Battle Axe',
    'item.weapon_dual_axe.desc': 'Battle Axe (dual-wieldable)',
    'item.weapon_longbow.name': 'Longbow',
    'item.weapon_longbow.desc': 'Longbow (ranged)',
    'item.weapon_crossbow.name': 'Crossbow',
    'item.weapon_crossbow.desc': 'Crossbow (ranged)',
    'item.weapon_staff.name': 'Staff',
    'item.weapon_staff.desc': 'Staff (casts magic)',
    'item.armor_cloth_cap.name': 'Cloth Cap',
    'item.armor_cloth_cap.desc': 'Cloth Cap (light)',
    'item.armor_iron_helmet.name': 'Iron Helmet',
    'item.armor_iron_helmet.desc': 'Iron Helmet (physical defense)',
    'item.armor_cloth_vest.name': 'Cloth Vest',
    'item.armor_cloth_vest.desc': 'Cloth Vest (light)',
    'item.armor_iron_plate.name': 'Iron Plate',
    'item.armor_iron_plate.desc': 'Iron Plate (physical defense)',
    'item.armor_leather_armor.name': 'Leather Armor',
    'item.armor_leather_armor.desc': 'Leather Armor (balanced defense)',
    'item.armor_iron_bracers.name': 'Iron Bracers',
    'item.armor_iron_bracers.desc': 'Iron Bracers (physical defense)',
    'item.armor_cloth_pants.name': 'Cloth Pants',
    'item.armor_cloth_pants.desc': 'Cloth Pants (light)',
    'item.armor_iron_greaves.name': 'Iron Greaves',
    'item.armor_iron_greaves.desc': 'Iron Greaves (physical defense)',
    'item.consumable_flask.name': 'Healing Flask',
    'item.consumable_flask.desc': 'Restores health when drunk',
    'item.material_stone.name': 'Stone',
    'item.material_stone.desc': 'Common building material',
    'item.key_rusted.name': 'Rusted Key',
    'item.key_rusted.desc': 'Can open a locked door somewhere',
}
