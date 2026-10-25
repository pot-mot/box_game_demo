import type {CharacterColorPalette} from './types.ts'
import type {BoxPartPalette} from '../../../render/box_parts.ts'
import {darkenColor, lightenColor} from '../../../render/constants.ts'

/** 6 套基础调色板，按 faction % 6 选取 */
const BASE_PALETTES: readonly CharacterColorPalette[] = [
    {skinColor: 0xf0c8a0, hairColor: 0x3a2218, bodyColor: 0xe06040, legColor: 0x303050},
    {skinColor: 0xf0c8a0, hairColor: 0x1a1a2a, bodyColor: 0x4060e0, legColor: 0x2a3050},
    {skinColor: 0xf0c8a0, hairColor: 0x2a3a18, bodyColor: 0x40a040, legColor: 0x2a302a},
    {skinColor: 0xf0c8a0, hairColor: 0x3a3018, bodyColor: 0xc0a040, legColor: 0x403030},
    {skinColor: 0xf0c8a0, hairColor: 0x3a1a22, bodyColor: 0xc04060, legColor: 0x402040},
    {skinColor: 0xf0c8a0, hairColor: 0x2a2a2a, bodyColor: 0x808080, legColor: 0x404040},
]

/**
 * **阵营 → 主色的唯一入口**：人类身体 / 肢体披挂 / 面板色点 / 展示台全部复用本函数。
 * 基础色按 `faction % 6` 取（0 红 / 1 蓝 / 2 绿 / 3 黄 / 4 粉 / 5 灰），
 * 每右移一圈（tier）按「暗 / 亮 / 原」循环微调明暗，保证同一阵营数字处处得到完全一致的颜色。
 */
export const factionColorOf = (faction: number): number => {
    const idx = faction % BASE_PALETTES.length
    const tier = Math.floor(faction / BASE_PALETTES.length)
    const base = BASE_PALETTES[idx].bodyColor
    if (tier === 0) return base
    const mod = tier % 3
    if (mod === 1) return darkenColor(base, 0.7)
    if (mod === 2) return lightenColor(base, 1.25)
    return base
}

/** 根据 faction 选取调色板：肤色固定，发色 / 腿色按 tier 微调，主色统一取 `factionColorOf` */
export const SELECT_PALETTE = (faction: number): CharacterColorPalette => {
    const idx = faction % BASE_PALETTES.length
    const tier = Math.floor(faction / BASE_PALETTES.length)
    const base = BASE_PALETTES[idx]
    const bodyColor = factionColorOf(faction)
    if (tier === 0) return {...base}
    const mod = tier % 3
    if (mod === 1) return {
        ...base,
        bodyColor,
        legColor: darkenColor(base.legColor, 0.7),
        hairColor: darkenColor(base.hairColor, 0.85),
    }
    if (mod === 2) return {
        ...base,
        bodyColor,
        legColor: lightenColor(base.legColor, 1.15),
        hairColor: lightenColor(base.hairColor, 1.1),
    }
    return {...base, bodyColor}
}

/** 预设骨架默认调色板（与 `SELECT_PALETTE(0)` 一致） */
export const PRESET_PALETTE: BoxPartPalette = {
    skinColor: 0xf0c8a0,
    hairColor: 0x3a2218,
    bodyColor: 0xe06040,
    legColor: 0x303050,
}

/** 髋部 pivot 基准高度（模型本地 Y），由 render 层共享常量提供 */
export {HIP_Y} from '../../../render/constants.ts'

/** 行走动画基准步频对应速度（m/s）：WALK_CYCLE_FREQ=6 rad/s 时 master 公式 1.2+1.3×speed=6 → speed≈3.69 */
export const WALK_BASE_SPEED = 3.7

/** 行走播放变速比例上下限（步频随速度，clamp 防止过慢/过快滑步） */
export const WALK_SPEED_MIN_SCALE = 0.5
export const WALK_SPEED_MAX_SCALE = 2

/** 行走速度 → 播放变速比例 */
export const walkSpeedScale = (speed: number): number =>
    Math.max(WALK_SPEED_MIN_SCALE, Math.min(WALK_SPEED_MAX_SCALE, speed / WALK_BASE_SPEED))

/** 游泳俯卧前倾角（绕本地 X 轴，face-down；供世界根姿态与展示台共用） */
export const SWIM_PRONE_PITCH = Math.PI * 0.38

/** 身体朝向旋转速度（rad/s） */
export const ROTATION_SPEED = 10

/** 速度低于此阈值时不更新目标朝向（m/s） */
export const VELOCITY_DIR_THRESHOLD = 0.05

/**
 * 武器骨骼握持屈角（rad，施加在左右手武器骨骼 `rightWeaponMount` / `leftWeaponMount` 上）：
 * 使武器相对前臂近乎垂直的天然握持姿态。待机/行走（持械）与攻击 clip 通用——
 * 武器骨骼控制武器模型朝向（腕关节不再承担握持角）。
 * 武器与前臂夹角 = 180° − |WEAPON_GRIP_FLEX + 该武器固有前倾（模型烘焙）| ≈ 83°~90°。
 */
export const WEAPON_GRIP_FLEX = 1.7

/** 状态过渡混合时长（秒）：新状态动画从切换前关节快照收敛，消除关节角突跳 */
export const STATE_BLEND_DURATION = 0.15

/** 格挡举盾循环姿态周期（秒） */
export const BLOCKING_POSE_PERIOD = 1.6

/** 破防硬直姿态时长（秒；仅用于编辑器预览与基础 clip 烘焙） */
export const GUARD_BROKEN_POSE_DURATION = 1.2
