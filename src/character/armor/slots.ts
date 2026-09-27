/** 护甲槽位（头盔 / 胸甲 / 臂甲 / 护腿） */
export const ARMOR_SLOTS = ['head', 'chest', 'arms', 'legs'] as const
export type ArmorSlot = typeof ARMOR_SLOTS[number]

/** 槽位中文名（面板 / 提示） */
export const ARMOR_SLOT_LABELS: Record<ArmorSlot, string> = {
    head: '头盔',
    chest: '胸甲',
    arms: '臂甲',
    legs: '护腿',
}
