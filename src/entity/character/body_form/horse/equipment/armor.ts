import type {ArmorPieceConfig} from '../../../../../character/armor/types.ts'

/** 马护甲：头 / 躯干 / 腿 / 蹄（数值契约；外观由体形部件承担） */
const piece = (
    id: string,
    name: string,
    slot: string,
    defense: {physical: number; magic: number},
    attack: {physical: number; magic: number},
    moveSpeedMultiplier: number,
    color: number,
): ArmorPieceConfig => ({
    id, name, slot, defense, attack, moveSpeedMultiplier,
    allowedBodyFormIds: ['horse'],
    mesh: {id: 'plate', color, accentColor: 0x5a4a34},
})

export const HORSE_ARMOR_PIECES: readonly ArmorPieceConfig[] = [
    piece('horse_head_armor', '马首面甲', 'head', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 1, 0x8a8f98),
    piece('horse_barding', '马身具装', 'torso', {physical: 3, magic: 0}, {physical: 0, magic: 0}, 0.95, 0x7a7f88),
    piece('horse_hoof_shoes', '马蹄铁', 'hooves', {physical: 2, magic: 0}, {physical: 1, magic: 0}, 1, 0x9a9a9a),
]
