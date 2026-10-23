import type {LimbPieceConfig} from '../../../../../character/armor/types.ts'

/** 马肢体组件：头 / 躯干 / 腿 / 尾（数值契约；外观由体形部件承担） */
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
    allowedBodyFormIds: ['horse'],
    mesh: {race: 'elf', color, accentColor: 0x8fbf6f},
})

export const HORSE_LIMB_PIECES: readonly LimbPieceConfig[] = [
    piece('horse_iron_legs', '马铁腿甲', 'legs', {physical: 2, magic: 0}, {physical: 0, magic: 0}, 0.97, 0x8a8f98),
    piece('horse_tail_banner', '马尾长缨', 'tail', {physical: 0, magic: 1}, {physical: 0, magic: 0}, 1.03, 0xe8d3b0),
    piece('horse_head_plume', '马首翎羽', 'head', {physical: 1, magic: 0}, {physical: 0, magic: 1}, 1, 0xe8d3b0),
]
