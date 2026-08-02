import type {CharacterColorPalette} from './types.ts'

/** 6 套基础调色板，按 faction % 6 选取 */
const BASE_PALETTES: readonly CharacterColorPalette[] = [
    {skinColor: 0xf0c8a0, hairColor: 0x3a2218, bodyColor: 0xe06040, legColor: 0x303050},
    {skinColor: 0xf0c8a0, hairColor: 0x1a1a2a, bodyColor: 0x4060e0, legColor: 0x2a3050},
    {skinColor: 0xf0c8a0, hairColor: 0x2a3a18, bodyColor: 0x40a040, legColor: 0x2a302a},
    {skinColor: 0xe8c070, hairColor: 0x3a3018, bodyColor: 0xc0a040, legColor: 0x403030},
    {skinColor: 0xf0c8a0, hairColor: 0x3a1a22, bodyColor: 0xc04060, legColor: 0x402040},
    {skinColor: 0xf0d0b8, hairColor: 0x2a2a2a, bodyColor: 0x808080, legColor: 0x404040},
]

/** RGB 颜色明暗缩放 */
const darken = (color: number, factor: number): number => {
    const r = Math.floor(((color >> 16) & 0xff) * factor)
    const g = Math.floor(((color >> 8) & 0xff) * factor)
    const b = Math.floor((color & 0xff) * factor)
    return (r << 16) | (g << 8) | b
}

const lighten = (color: number, factor: number): number => {
    const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * factor))
    const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * factor))
    const b = Math.min(255, Math.floor((color & 0xff) * factor))
    return (r << 16) | (g << 8) | b
}

/** 根据 faction 选取调色板，faction > 5 时在基础色上微调明暗 */
export const SELECT_PALETTE = (faction: number): CharacterColorPalette => {
    const idx = faction % BASE_PALETTES.length
    const tier = Math.floor(faction / BASE_PALETTES.length)
    const base = BASE_PALETTES[idx]
    if (tier === 0) return {...base}
    const mod = tier % 3
    if (mod === 1) return {
        ...base,
        bodyColor: darken(base.bodyColor, 0.7),
        legColor: darken(base.legColor, 0.7),
        hairColor: darken(base.hairColor, 0.85),
    }
    if (mod === 2) return {
        ...base,
        bodyColor: lighten(base.bodyColor, 1.25),
        legColor: lighten(base.legColor, 1.15),
        hairColor: lighten(base.hairColor, 1.1),
    }
    return {...base}
}

/** 身体部位比例（头 : 身 : 腿 ≈ 1.4 : 3.6 : 5） */
export const HEAD_RATIO = 0.14
export const BODY_RATIO = 0.36
export const LEG_RATIO = 0.5

/** 头部宽度系数（相对于 bodyW） */
export const HEAD_WIDTH_RATIO = 0.65

/** 肢体宽度系数（相对于 radius * 2 即身宽） */
export const ARM_WIDTH_RATIO = 0.4
export const LEG_WIDTH_RATIO = 0.5

/** 身体前后深度系数（bodyD = bodyW * BODY_DEPTH_RATIO） */
export const BODY_DEPTH_RATIO = 0.75

/** 手臂X轴偏移（距离身体侧边的额外间距） */
export const ARM_X_GAP = 0.02

/** 腿部X轴偏移（距离身体中心线的间距） */
export const LEG_X_GAP = 0.04

/** 模型材质粗糙度 */
export const MODEL_ROUGHNESS = 0.6

/** 背面 / 侧面颜色暗化比例 */
export const BACK_DARKEN_RATIO = 0.55
export const SIDE_DARKEN_RATIO = 0.85

/** 行走速度归一化上限（m/s），用于动画周期计算 */
export const WALK_ANIM_MAX_SPEED = 6.0

/** 身体朝向旋转速度（rad/s） */
export const ROTATION_SPEED = 10

/** 速度低于此阈值时不更新目标朝向（m/s） */
export const VELOCITY_DIR_THRESHOLD = 0.05

/** 头部水平旋转相对身体的最大角度（rad），±90° */
export const HEAD_TURN_LIMIT = Math.PI / 2

/** 面部 Canvas 纹理尺寸（像素） */
export const FACE_CANVAS_SIZE = 128

export {darken, lighten}
