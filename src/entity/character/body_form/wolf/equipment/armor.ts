import type {ArmorPieceConfig, ArmorSetDefinition} from '../../../../../character/armor/types.ts'
import type {CharacterMaterialId} from '../../../../../render/character_materials.ts'
import type {StringLocaleKey} from '../../../../../i18n/index.ts'

const piece = (
    id: string,
    name: string,
    slot: string,
    defense: {physical: number; magic: number},
    attack: {physical: number; magic: number},
    moveSpeedMultiplier: number,
    color: number,
    nameKey: StringLocaleKey,
    material?: CharacterMaterialId,
    accentColor = 0x3a2a18,
): ArmorPieceConfig => ({
    id, name, nameKey, slot, defense, attack, moveSpeedMultiplier,
    allowedBodyFormIds: ['wolf'],
    mesh: {id: 'plate', color, accentColor, ...(material !== undefined ? {material} : {})},
    colliders: [],
    hurtBoxes: [],
})

/** 皮革具装：轻便皮革护具 */
export const WOLF_ARMOR_PIECES: readonly ArmorPieceConfig[] = [
    piece('wolf_head_guard', '皮革护首', 'head', {physical: 1, magic: 0}, {physical: 0, magic: 0}, 1, 0x8a7a5a, 'armor.wolf_head_guard'),
    piece('wolf_hide', '皮革胸甲', 'torso', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 0.98, 0x6a5236, 'armor.wolf_hide'),
    piece('wolf_leg_wraps', '皮革护腿', 'legs', {physical: 1, magic: 0}, {physical: 0, magic: 0}, 1.02, 0x7a6a4a, 'armor.wolf_leg_wraps'),
    piece('wolf_claw_guard', '皮革护爪', 'claw', {physical: 1, magic: 0}, {physical: 1, magic: 0}, 1, 0xa08a62, 'armor.wolf_claw_guard'),
    /* 狼骨具装（原肢体套装迁移）：皮毛衬里的骨甲，覆盖头 / 躯干 / 腿 / 爪 */
    piece('wolf_bone_head', '狼骨护首', 'head', {physical: 1, magic: 0}, {physical: 0, magic: 1}, 1, 0xd6d2c6, 'armor.wolf_bone_head', 'bone', 0x8a8578),
    piece('wolf_bone_torso', '狼骨护胸', 'torso', {physical: 1, magic: 1}, {physical: 0, magic: 0}, 0.99, 0xd6d2c6, 'armor.wolf_bone_torso', 'bone', 0x8a8578),
    piece('wolf_bone_legs', '狼骨护腿', 'legs', {physical: 1, magic: 0}, {physical: 0, magic: 0}, 1.01, 0xd6d2c6, 'armor.wolf_bone_legs', 'bone', 0x8a8578),
    piece('wolf_bone_claw', '狼骨护爪', 'claw', {physical: 1, magic: 0}, {physical: 1, magic: 0}, 1, 0xd6d2c6, 'armor.wolf_bone_claw', 'bone', 0x8a8578),
]

/** 狼护甲套装（外观图鉴按整套预览） */
export const WOLF_ARMOR_SETS: readonly ArmorSetDefinition[] = [
    {
        nameKey: 'armor_set.wolf_leather',
        armor: {head: 'wolf_head_guard', torso: 'wolf_hide', legs: 'wolf_leg_wraps', claw: 'wolf_claw_guard'},
    },
    {
        nameKey: 'armor_set.wolf_bone',
        armor: {head: 'wolf_bone_head', torso: 'wolf_bone_torso', legs: 'wolf_bone_legs', claw: 'wolf_bone_claw'},
    },
]
