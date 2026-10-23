import type {ArmorPieceConfig} from '../../../../../character/armor/types.ts'
import type {StringLocaleKey} from '../../../../../i18n/index.ts'

/** 马护甲：头 / 躯干 / 腿 / 蹄（数值契约；外观由体形部件承担） */
const piece = (
    id: string,
    name: string,
    slot: string,
    defense: {physical: number; magic: number},
    attack: {physical: number; magic: number},
    moveSpeedMultiplier: number,
    color: number,
    nameKey: StringLocaleKey,
): ArmorPieceConfig => ({
    id, name, nameKey, slot, defense, attack, moveSpeedMultiplier,
    allowedBodyFormIds: ['horse'],
    mesh: {id: 'plate', color, accentColor: 0x5a4a34},
})

export const HORSE_ARMOR_PIECES: readonly ArmorPieceConfig[] = [
    piece('horse_head_armor', '马首面甲', 'head', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 1, 0x8a8f98, 'armor.horse_head_armor'),
    piece('horse_barding', '马身具装', 'torso', {physical: 3, magic: 0}, {physical: 0, magic: 0}, 0.95, 0x7a7f88, 'armor.horse_barding'),
    piece('horse_hoof_shoes', '马蹄铁', 'hooves', {physical: 2, magic: 0}, {physical: 1, magic: 0}, 1, 0x9a9a9a, 'armor.horse_hoof_shoes'),
    piece('horse_leg_guards', '马腿铁甲', 'legs', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 0.98, 0x8a8f98, 'armor.horse_leg_guards'),
]
