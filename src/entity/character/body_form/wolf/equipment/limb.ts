import type {LimbPieceConfig} from '../../../../../character/armor/types.ts'

/** 狼肢体组件：爪 / 头 / 躯干 / 腿 / 尾（数值契约；外观由体形部件承担） */
const piece = (
    id: string,
    name: string,
    slot: string,
    defense: {physical: number; magic: number},
    attack: {physical: number; magic: number},
    moveSpeedMultiplier: number,
    color: number,
): LimbPieceConfig => ({
    id, name, slot, defense, attack, moveSpeedMultiplier,
    allowedBodyFormIds: ['wolf'],
    mesh: {race: 'orc', color, accentColor: 0x35502a},
})

export const WOLF_LIMB_PIECES: readonly LimbPieceConfig[] = [
    piece('wolf_claw_wrap', '狼爪束甲', 'claw', {physical: 1, magic: 0}, {physical: 1, magic: 0}, 1, 0x6f9a4a),
    piece('wolf_tail_guard', '狼尾护甲', 'tail', {physical: 0, magic: 1}, {physical: 0, magic: 0}, 1.02, 0x6f9a4a),
    piece('wolf_torso_harness', '狼躯束具', 'torso', {physical: 1, magic: 1}, {physical: 0, magic: 0}, 0.99, 0x6f9a4a),
]
