import type {StringLocaleKey} from '../../i18n/index.ts'

/** 护甲槽位（头盔 / 胸甲 / 臂甲 / 护腿） */
export const ARMOR_SLOTS = ['head', 'chest', 'arms', 'legs'] as const
export type ArmorSlot = typeof ARMOR_SLOTS[number]

/** 槽位本地化名键（面板 / 提示） */
export const ARMOR_SLOT_LABELS: Record<ArmorSlot, StringLocaleKey> = {
    head: 'armor_slot.head',
    chest: 'armor_slot.chest',
    arms: 'armor_slot.arms',
    legs: 'armor_slot.legs',
}

/**
 * 肢体槽位（头部 / 手臂 / 身体 / 腿部）：复用护甲数值与外观机制，默认顶替对应人类肢体。
 * 与护甲槽位是**两套独立槽位**（面板同一行左右并列：左护甲、右肢体），
 * 缺省（空 / undefined / null）= 保留默认人类肢体。
 */
export const LIMB_SLOTS = ['head', 'arms', 'body', 'legs'] as const
export type LimbSlot = typeof LIMB_SLOTS[number]

/** 肢体槽位本地化名键（面板 / 提示） */
export const LIMB_SLOT_LABELS: Record<LimbSlot, StringLocaleKey> = {
    head: 'limb_slot.head',
    arms: 'limb_slot.arms',
    body: 'limb_slot.body',
    legs: 'limb_slot.legs',
}
