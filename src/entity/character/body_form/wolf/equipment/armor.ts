import type {ArmorPieceConfig} from '../../../../../character/armor/types.ts'
import type {StringLocaleKey} from '../../../../../i18n/index.ts'

/** 狼护甲 / 肢体：体形固有毛皮与骨甲的外观配方由体形本体承担，装备提供数值与槽位。 */
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
    allowedBodyFormIds: ['wolf'],
    mesh: {id: 'plate', color, accentColor: 0x3a2a18},
    colliders: [],
    hurtBoxes: [],
})

export const WOLF_ARMOR_PIECES: readonly ArmorPieceConfig[] = [
    piece('wolf_head_guard', '狼首骨甲', 'head', {physical: 1, magic: 0}, {physical: 0, magic: 0}, 1, 0x8a7a5a, 'armor.wolf_head_guard'),
    piece('wolf_hide', '狼皮胸甲', 'torso', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 0.98, 0x6a5236, 'armor.wolf_hide'),
    piece('wolf_leg_wraps', '狼腿束带', 'legs', {physical: 1, magic: 0}, {physical: 0, magic: 0}, 1.02, 0x7a6a4a, 'armor.wolf_leg_wraps'),
    piece('wolf_claw_guard', '狼爪护刃', 'claw', {physical: 1, magic: 0}, {physical: 1, magic: 0}, 1, 0xa08a62, 'armor.wolf_claw_guard'),
]
