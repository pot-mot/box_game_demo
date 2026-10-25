import type {ArmorPieceConfig} from '../../../../../character/armor/types.ts'
import type {StringLocaleKey} from '../../../../../i18n/index.ts'

/** wyvern 护甲：头 / 躯干 / 腿 / 翼 / 尾（数值契约；外观由体形部件承担） */
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

export const WYVERN_ARMOR_PIECES: readonly ArmorPieceConfig[] = [
    piece('wyvern_head_crest', '龙首甲冠', 'head', {physical: 2, magic: 1}, {physical: 0, magic: 0}, 1, 0x6b7a5a, 'armor.wyvern_head_crest'),
    piece('wyvern_scale_plate', '龙鳞胸甲', 'torso', {physical: 3, magic: 2}, {physical: 0, magic: 0}, 0.96, 0x6b7a5a, 'armor.wyvern_scale_plate'),
    piece('wyvern_wing_guards', '龙翼护甲', 'wing', {physical: 1, magic: 2}, {physical: 0, magic: 0}, 1.01, 0x6b7a5a, 'armor.wyvern_wing_guards'),
    piece('wyvern_tail_spikes', '龙尾棘甲', 'tail', {physical: 1, magic: 0}, {physical: 1, magic: 0}, 1.02, 0x6b7a5a, 'armor.wyvern_tail_spikes'),
    piece('wyvern_leg_guards', '龙腿鳞甲', 'legs', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 1, 0x6b7a5a, 'armor.wyvern_leg_guards'),
]
