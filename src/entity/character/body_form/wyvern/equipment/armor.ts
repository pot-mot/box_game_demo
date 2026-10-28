import type {ArmorPieceConfig, ArmorSetDefinition} from '../../../../../character/armor/types.ts'
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
): ArmorPieceConfig => ({
    id, name, nameKey, slot, defense, attack, moveSpeedMultiplier,
    allowedBodyFormIds: ['wyvern'],
    mesh: {id: 'plate', color, accentColor: 0x3f4a34, material: 'scale'},
    colliders: [],
    hurtBoxes: [],
})

/** 龙鳞具装：鳞甲头冠 / 胸甲 / 翼甲 / 尾棘 + 龙骸具装（原肢体套装迁移） */
export const WYVERN_ARMOR_PIECES: readonly ArmorPieceConfig[] = [
    piece('wyvern_head_crest', '龙首甲冠', 'head', {physical: 2, magic: 1}, {physical: 0, magic: 0}, 1, 0x6b7a5a, 'armor.wyvern_head_crest'),
    piece('wyvern_scale_plate', '龙鳞胸甲', 'torso', {physical: 3, magic: 2}, {physical: 0, magic: 0}, 0.96, 0x6b7a5a, 'armor.wyvern_scale_plate'),
    piece('wyvern_wing_guards', '龙翼护甲', 'wing', {physical: 1, magic: 2}, {physical: 0, magic: 0}, 1.01, 0x6b7a5a, 'armor.wyvern_wing_guards'),
    piece('wyvern_tail_spikes', '龙尾棘甲', 'tail', {physical: 1, magic: 0}, {physical: 1, magic: 0}, 1.02, 0x6b7a5a, 'armor.wyvern_tail_spikes'),
    piece('wyvern_leg_guards', '龙腿鳞甲', 'legs', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 1, 0x6b7a5a, 'armor.wyvern_leg_guards'),
    /* 龙骸具装（原肢体套装迁移）：骨白色头 / 尾 / 翼 / 躯干 / 腿护具 */
    piece('wyvern_bone_head', '龙骸护首', 'head', {physical: 1, magic: 1}, {physical: 0, magic: 1}, 1, 0xe6e2d3, 'armor.wyvern_bone_head'),
    piece('wyvern_bone_tail', '龙骸护尾', 'tail', {physical: 1, magic: 0}, {physical: 1, magic: 0}, 1.01, 0xe6e2d3, 'armor.wyvern_bone_tail'),
    piece('wyvern_bone_wing', '龙骸护翼', 'wing', {physical: 1, magic: 1}, {physical: 0, magic: 0}, 1.01, 0xe6e2d3, 'armor.wyvern_bone_wing'),
    piece('wyvern_bone_torso', '龙骸护胸', 'torso', {physical: 2, magic: 1}, {physical: 0, magic: 0}, 0.99, 0xe6e2d3, 'armor.wyvern_bone_torso'),
    piece('wyvern_bone_legs', '龙骸护腿', 'legs', {physical: 1, magic: 0}, {physical: 0, magic: 0}, 1, 0xe6e2d3, 'armor.wyvern_bone_legs'),
]

/** 龙护甲套装（外观图鉴按整套预览） */
export const WYVERN_ARMOR_SETS: readonly ArmorSetDefinition[] = [
    {
        nameKey: 'armor_set.wyvern_scale',
        armor: {head: 'wyvern_head_crest', torso: 'wyvern_scale_plate', wing: 'wyvern_wing_guards', tail: 'wyvern_tail_spikes', legs: 'wyvern_leg_guards'},
    },
    {
        nameKey: 'armor_set.wyvern_bone',
        armor: {head: 'wyvern_bone_head', tail: 'wyvern_bone_tail', wing: 'wyvern_bone_wing', torso: 'wyvern_bone_torso', legs: 'wyvern_bone_legs'},
    },
]
