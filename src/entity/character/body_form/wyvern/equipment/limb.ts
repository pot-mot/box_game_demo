import type {LimbPieceConfig} from '../../../../../character/armor/types.ts'

/** wyvern 肢体组件：翼爪 / 翼 / 头 / 躯干 / 腿 / 尾（数值契约；外观由体形部件承担） */
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
    allowedBodyFormIds: ['wyvern'],
    mesh: {race: 'skeleton', color, accentColor: 0x8a8578},
})

export const WYVERN_LIMB_PIECES: readonly LimbPieceConfig[] = [
    piece('wyvern_wing_claw_blade', '龙翼爪刃', 'wing_claw', {physical: 1, magic: 0}, {physical: 2, magic: 0}, 1, 0xe6e2d3),
    piece('wyvern_head_horns', '龙首角饰', 'head', {physical: 1, magic: 1}, {physical: 0, magic: 1}, 1, 0xe6e2d3),
    piece('wyvern_tail_blade', '龙尾刃甲', 'tail', {physical: 1, magic: 0}, {physical: 1, magic: 0}, 1.01, 0xe6e2d3),
]
