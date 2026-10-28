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
): ArmorPieceConfig => ({
    id, name, nameKey, slot, defense, attack, moveSpeedMultiplier,
    allowedBodyFormIds: ['horse'],
    mesh: {id: 'plate', color, accentColor: 0x5a4a34, ...(material !== undefined ? {material} : {})},
    colliders: [],
    hurtBoxes: [],
})

/** 马铁具装：金属面甲 / 具装 / 蹄铁 + 皮革马革具装 */
export const HORSE_ARMOR_PIECES: readonly ArmorPieceConfig[] = [
    piece('horse_head_armor', '马首面甲', 'head', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 1, 0x8a8f98, 'armor.horse_head_armor'),
    piece('horse_barding', '马身具装', 'torso', {physical: 3, magic: 0}, {physical: 0, magic: 0}, 0.95, 0x7a7f88, 'armor.horse_barding'),
    piece('horse_hoof_shoes', '马蹄铁', 'hooves', {physical: 2, magic: 0}, {physical: 1, magic: 0}, 1, 0x9a9a9a, 'armor.horse_hoof_shoes'),
    piece('horse_leg_guards', '马腿铁甲', 'legs', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 0.98, 0x8a8f98, 'armor.horse_leg_guards'),
    /* 马革具装（原肢体套装迁移）：皮革头饰 / 胸甲 / 腿甲 */
    piece('horse_leather_head', '马革护首', 'head', {physical: 1, magic: 0}, {physical: 0, magic: 1}, 1, 0xe8d3b0, 'armor.horse_leather_head', 'leather'),
    piece('horse_leather_torso', '马革护胸', 'torso', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 0.99, 0x6a5236, 'armor.horse_leather_torso', 'leather'),
    piece('horse_leather_legs', '马革护腿', 'legs', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 0.97, 0x8a8f98, 'armor.horse_leather_legs', 'leather'),
]

/** 马护甲套装（外观图鉴按整套预览） */
export const HORSE_ARMOR_SETS: readonly ArmorSetDefinition[] = [
    {
        nameKey: 'armor_set.horse_iron',
        armor: {head: 'horse_head_armor', torso: 'horse_barding', hooves: 'horse_hoof_shoes', legs: 'horse_leg_guards'},
    },
    {
        nameKey: 'armor_set.horse_leather',
        armor: {head: 'horse_leather_head', torso: 'horse_leather_torso', legs: 'horse_leather_legs'},
    },
]
