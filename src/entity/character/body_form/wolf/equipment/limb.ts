import type {LimbPieceConfig} from '../../../../../character/armor/types.ts'
import type {StringLocaleKey} from '../../../../../i18n/index.ts'

/** 狼肢体组件：爪 / 头 / 躯干 / 腿 / 尾（数值契约；外观由体形部件承担） */
const piece = (
    id: string,
    name: string,
    slot: string,
    defense: {physical: number; magic: number},
    attack: {physical: number; magic: number},
    moveSpeedMultiplier: number,
    color: number,
    nameKey: StringLocaleKey,
): LimbPieceConfig => ({
    id, name, nameKey, slot, defense, attack, moveSpeedMultiplier,
    allowedBodyFormIds: ['wolf'],
    mesh: {race: 'orc', color, accentColor: 0x35502a},
})

export const WOLF_LIMB_PIECES: readonly LimbPieceConfig[] = [
    piece('wolf_claw_wrap', '狼爪束甲', 'claw', {physical: 1, magic: 0}, {physical: 1, magic: 0}, 1, 0x6f9a4a, 'limb.wolf_claw_wrap'),
    piece('wolf_tail_guard', '狼尾护甲', 'tail', {physical: 0, magic: 1}, {physical: 0, magic: 0}, 1.02, 0x6f9a4a, 'limb.wolf_tail_guard'),
    piece('wolf_torso_harness', '狼躯束具', 'torso', {physical: 1, magic: 1}, {physical: 0, magic: 0}, 0.99, 0x6f9a4a, 'limb.wolf_torso_harness'),
    piece('wolf_head_guard', '狼首护具', 'head', {physical: 1, magic: 0}, {physical: 0, magic: 1}, 1, 0x6f9a4a, 'limb.wolf_head_guard'),
    piece('wolf_leg_guards', '狼腿护具', 'legs', {physical: 1, magic: 0}, {physical: 0, magic: 0}, 1.01, 0x6f9a4a, 'limb.wolf_leg_guards'),
]
