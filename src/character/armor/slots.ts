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

/**
 * 肢体槽位（头部 / 手臂 / 身体 / 腿部）：复用护甲数值与外观机制，默认顶替对应人类肢体。
 * 与护甲槽位是**两套独立槽位**（面板同一行左右并列：左护甲、右肢体），
 * 缺省（空 / undefined / null）= 保留默认人类肢体。
 */
export const LIMB_SLOTS = ['head', 'arms', 'body', 'legs'] as const
export type LimbSlot = typeof LIMB_SLOTS[number]

/** 肢体槽位中文名（面板 / 提示） */
export const LIMB_SLOT_LABELS: Record<LimbSlot, string> = {
    head: '头部',
    arms: '手臂',
    body: '身体',
    legs: '腿部',
}
