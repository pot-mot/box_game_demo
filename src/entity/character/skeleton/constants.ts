import type {BoxPartPalette} from '../../../render/box_parts.ts'

/** 预设骨架调色板（默认第 0 套角色配色，外观部件装载用；与 SELECT_PALETTE(0) 一致） */
export const PRESET_PALETTE: BoxPartPalette = {
    skinColor: 0xf0c8a0,
    hairColor: 0x3a2218,
    bodyColor: 0xe06040,
    legColor: 0x303050,
}

/** 手部模型高度（相对前臂）：前臂的 0.7 倍再缩短为 1/4，避免手部过长 */
export const HAND_HEIGHT_RATIO = 0.7 / 4
