import type {CharacterColorPalette} from './types.ts'
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

/** 根据 faction 选取调色板，faction > 5 时在基础色上微调明暗 */
export const SELECT_PALETTE = (faction: number): CharacterColorPalette => {
    const idx = faction % BASE_PALETTES.length
    const tier = Math.floor(faction / BASE_PALETTES.length)
    const base = BASE_PALETTES[idx]
    if (tier === 0) return {...base}
    const mod = tier % 3
    if (mod === 1) return {
        ...base,
        bodyColor: darkenColor(base.bodyColor, 0.7),
        legColor: darkenColor(base.legColor, 0.7),
        hairColor: darkenColor(base.hairColor, 0.85),
    }
    if (mod === 2) return {
        ...base,
        bodyColor: lightenColor(base.bodyColor, 1.25),
        legColor: lightenColor(base.legColor, 1.15),
        hairColor: lightenColor(base.hairColor, 1.1),
    }
    return {...base}
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

/** 行走速度归一化上限（m/s），用于动画周期计算 */
export const WALK_ANIM_MAX_SPEED = 6.0

/** 水平速度平滑系数（EMA 权重，0~1，越小越平滑）：抑制 coyote 吸附/弹跳导致的速度突变引起的动画频率抖动 */
export const HORIZONTAL_SPEED_SMOOTHING = 0.3

/** 身体朝向旋转速度（rad/s） */
export const ROTATION_SPEED = 10

/** 速度低于此阈值时不更新目标朝向（m/s） */
export const VELOCITY_DIR_THRESHOLD = 0.05

/** 头部水平旋转相对身体的最大角度（rad），±90° */
export const HEAD_TURN_LIMIT = Math.PI / 2

// ── 持握与武器骨骼动态 ──

/*
 * 武器的固有握持姿态（怎么被握住）是**武器模型自身属性**，已随模型烘焙（`weapon_mesh.ts` 的
 * `WEAPON_MESH_GRIPS`）；武器与前臂的夹角、刃面偏转、逐动作微调全部由武器骨骼
 * （`rightWeaponMount` / `leftWeaponMount`）的动画轨道控制。此处不再有任何外部武器握持常量。
 */

/**
 * 双手武器副握点相对**握把中心**沿武器轴（本地 +Y，握把→刃尖）的偏移距离（米）：
 * 0 = 与主手同握把处，正值朝刃尖、负值朝柄尾。生产与编辑器共用。
 * 调用方需叠加武器模型的握把局部 y（`weaponGripY`）得到相对武器原点的偏移。
 */
export const TWO_HAND_GRIP_OFFSET = 0

/** 持械戒备位：肩前举角（rad，负值 = 前摆，刃尖朝上收至体侧前方） */
export const WEAPON_READY_SHOULDER = -0.45

/** 持械戒备位：肘弯曲（rad，负值 = 前臂向前折、肘尖朝后，符合人体；见 docs/bone_animation/动作设计规范.md §3） */
export const WEAPON_READY_ELBOW = -0.85

/** 持械戒备位：持械臂微摆幅度（rad，武器竖持微摆） */
export const WEAPON_READY_SWAY = 0.03

/**
 * 武器骨骼握持屈角（rad，施加在左右手武器骨骼 `rightWeaponMount` / `leftWeaponMount` 上）：
 * 使武器相对前臂近乎垂直的天然握持姿态。待机/行走（持械）与攻击 clip 通用——
 * 武器骨骼控制武器模型朝向（腕关节不再承担握持角）。
 * 武器与前臂夹角 = 180° − |WEAPON_GRIP_FLEX + 该武器固有前倾（模型烘焙）| ≈ 83°~90°。
 */
export const WEAPON_GRIP_FLEX = 1.7

/** 持械行走：持械臂摆动幅度（rad，远小于空手摆臂） */
export const WEAPON_WALK_ARM_SWING = 0.12

/** 状态过渡混合时长（秒）：新状态动画从切换前关节快照收敛，消除关节角突跳 */
export const STATE_BLEND_DURATION = 0.15

// ── 受击硬直 ──

/** 受击后仰幅度（rad，spine.rotation.x 负值 = 向后仰） */
export const FLINCH_SPINE_BACK = 0.25

/** 受击双臂抬举护头（rad，肩 X 前抬） */
export const FLINCH_ARM_RAISE = 0.9

/** 受击双臂外张（rad，肩 Z） */
export const FLINCH_ARM_SPREAD = 0.5

/** 受击屈肘（rad，负值 = 前折） */
export const FLINCH_ELBOW = -1.2

/** 受击头部后仰（rad） */
export const FLINCH_HEAD_BACK = 0.15

// ── 基础状态 clip 烘焙 ──

/** clip 关键帧烘焙采样率（fps）：基础状态动画使用 */
export const CLIP_SAMPLE_FPS = 60
