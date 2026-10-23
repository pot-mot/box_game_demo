import type {ArmorPieceConfig} from '../../../../../character/armor/types.ts'

/** 狼护甲 / 肢体：体形固有毛皮与骨甲的外观配方由体形本体承担，装备提供数值与槽位。 */
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
    allowedBodyFormIds: ['wolf'],
    mesh: {id: 'plate', color, accentColor: 0x3a2a18},
})

export const WOLF_ARMOR_PIECES: readonly ArmorPieceConfig[] = [
    piece('wolf_head_guard', '狼首骨甲', 'head', {physical: 1, magic: 0}, {physical: 0, magic: 0}, 1, 0x8a7a5a),
    piece('wolf_hide', '狼皮胸甲', 'torso', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 0.98, 0x6a5236),
    piece('wolf_leg_wraps', '狼腿束带', 'legs', {physical: 1, magic: 0}, {physical: 0, magic: 0}, 1.02, 0x7a6a4a),
]
