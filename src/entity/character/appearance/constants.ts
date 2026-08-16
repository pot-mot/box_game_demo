import type {CharacterColorPalette} from './types.ts'
import type {WeaponGripPose, WeaponMeshId} from './weapon_mesh.ts'

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

/** 肢体宽度系数（相对于 bodyW 即身宽） */
export const ARM_WIDTH_RATIO = 0.4
export const LEG_WIDTH_RATIO = 0.5

/** 身体前后深度系数（bodyD = bodyW * BODY_DEPTH_RATIO） */
export const BODY_DEPTH_RATIO = 0.75

/** 模型基准尺寸（scale=1 时，与碰撞箱无关） */
export const MODEL_BASE_HEIGHT = 1
export const MODEL_BASE_WIDTH = 0.25

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

/** 水平速度平滑系数（EMA 权重，0~1，越小越平滑）：抑制 coyote 吸附/弹跳导致的速度突变引起的动画频率抖动 */
export const HORIZONTAL_SPEED_SMOOTHING = 0.3

/** 身体朝向旋转速度（rad/s） */
export const ROTATION_SPEED = 10

/** 速度低于此阈值时不更新目标朝向（m/s） */
export const VELOCITY_DIR_THRESHOLD = 0.05

/** 头部水平旋转相对身体的最大角度（rad），±90° */
export const HEAD_TURN_LIMIT = Math.PI / 2

/** 面部 Canvas 纹理尺寸（像素） */
export const FACE_CANVAS_SIZE = 128

// ── 攻击动画 ──

/** 无阶段信息回退：虚拟三阶段在总时长中的分界点（0-1） */
export const FALLBACK_WINDUP_END_RATIO = 0.3
export const FALLBACK_STRIKE_END_RATIO = 0.6

/** 无阶段信息回退：用 stateTime 驱动的假设攻击时长（秒） */
export const FALLBACK_ATTACK_DURATION = 0.5

/** 左臂平衡反摆幅度（rad，与持械臂动作互补） */
export const ATTACK_LEFT_ARM_COUNTER = 0.2

/** 左臂随动肘弯曲（rad） */
export const ATTACK_LEFT_ELBOW_BEND = 0.15

/** 蓄力阶段头部侧偏幅度（rad） */
export const ATTACK_HEAD_TILT_WINDUP = 0.08

/** 打击阶段头部反侧偏幅度（rad） */
export const ATTACK_HEAD_TILT_STRIKE = 0.05

/** 头部前后微晃幅度（rad） */
export const ATTACK_HEAD_BOB = 0.02

/** 头部微晃角频率（rad/s） */
export const ATTACK_HEAD_BOB_FREQ = 8

/** 瞄准/旋转维持阶段的持械臂微颤幅度（rad） */
export const ATTACK_HOLD_SWAY = 0.015

/** 维持阶段微颤角频率（rad/s） */
export const ATTACK_HOLD_SWAY_FREQ = 4

// ── 武器握持姿态 ──

/** 无姿态偏移的单位姿态（投掷物等贴掌武器用） */
const GRIP_NEUTRAL: WeaponGripPose = {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0}

/**
 * 各武器静态握持姿态（相对右腕 pivot）：
 * 武器 +Y 轴自握把延伸，rx<0 = 刃尖向前倾，ry 绕武器轴旋转控制刃面朝向。
 * 近战武器 rx 保持小角度，攻击时腕关节会动态对齐抵消 rx 使武器与前臂共线（guard 位）。
 */
export const WEAPON_GRIP_POSES: Record<WeaponMeshId, WeaponGripPose> = {
    /* 剑类：戒备位——刃尖朝上微前倾，武器收至体侧前方；攻击时腕部对齐抵消 rx 至共线 guard 位 */
    sword:       {x: 0, y: 0, z: 0, rx: -0.1, ry: 0, rz: 0},
    heavy_sword: {x: 0, y: 0, z: 0, rx: -0.12, ry: 0, rz: 0},
    /* 长杆类：竖提、微外八（与臂近乎共线，利于刺击） */
    spear:       {x: 0, y: 0, z: 0, rx: 0.05, ry: 0, rz: -0.12},
    staff:       {x: 0, y: 0, z: 0, rx: 0.05, ry: 0, rz: 0.1},
    /* 斧锤类：头朝上微前倾（小幅调整，本轮以剑类为主） */
    dual_axe:    {x: 0, y: 0, z: 0, rx: -0.2, ry: 0, rz: 0},
    war_hammer:  {x: 0, y: 0, z: 0, rx: -0.3, ry: Math.PI / 4, rz: 0},
    throwing_axe:{x: 0, y: 0, z: 0, rx: -0.3, ry: 0, rz: 0},
    /* 远程类：携带态枪口/弓臂朝下前倾 */
    bow:         {x: 0, y: 0, z: 0, rx: -0.15, ry: 0, rz: 0},
    crossbow:    {x: 0, y: 0, z: 0, rx: -0.6, ry: 0, rz: 0},
    shotgun:     {x: 0, y: 0, z: 0, rx: -0.6, ry: 0, rz: 0},
    magic_wand:  {x: 0, y: 0, z: 0, rx: -0.5, ry: 0, rz: 0},
    /* 投掷物：贴掌居中 */
    grenade:     {...GRIP_NEUTRAL, y: -0.02, rx: -0.3},
    molotov:     {...GRIP_NEUTRAL, y: -0.03, rx: -0.3},
    throwing_dart: GRIP_NEUTRAL,
}

// ── 双手握持与腕部动态 ──

/** 双手武器副手（左手）扶柄姿态：肩前举 + 内收 + 微屈肘 */
export const TWO_HAND_GRIP = {x: -1.1, y: -0.5, elbow: 0.25} as const

/** 挥砍时腕部刃面偏转系数（rotation.y = swingTilt × 系数，横斩时刃面转水平） */
export const WRIST_EDGE_YAW_FACTOR = 1.0

/** 持械戒备位：肩前举角（rad，负值 = 前摆，刃尖朝上收至体侧前方） */
export const WEAPON_READY_SHOULDER = -0.45

/** 持械戒备位：肘弯曲（rad，加大弯曲使武器竖持体前） */
export const WEAPON_READY_ELBOW = 0.85

/** 持械戒备位：持械臂微摆幅度（rad，武器竖持微摆） */
export const WEAPON_READY_SWAY = 0.03

/** 持械行走：持械臂摆动幅度（rad，远小于空手摆臂） */
export const WEAPON_WALK_ARM_SWING = 0.12

// ── 攻击动力链 ──

/** 髋部 pivot 基准高度（模型本地 Y）：-H/2 + legH，spine 重置基准 */
export const HIP_Y = -MODEL_BASE_HEIGHT / 2 + MODEL_BASE_HEIGHT * LEG_RATIO

/** 拧腰幅度：蓄力反向拧转（rad，按横斩分量 |sinTilt| 缩放） */
export const TWIST_WINDUP = 0.3

/** 拧腰幅度：打击顺向拧转（rad） */
export const TWIST_STRIKE = 0.35

/** 刺击探身距离（m，spine 前移量） */
export const THRUST_LUNGE_DIST = 0.09

/** 刺击预备反向拧转（rad） */
export const THRUST_COIL = 0.1

/** 旋转攻击蓄力拧转角（rad） */
export const SPIN_COIL = 0.5

/** 旋转攻击结束残余角（rad，recovery 由此回正，避免反向整圈回卷） */
export const SPIN_RESIDUAL = 0.3

/** 恢复惯性过冲缩放系数（过冲量 = 摆动末姿态幅度 × overshootRatio × 此系数） */
export const OVERSHOOT_SCALE = 1.0

/** 弓步：前（右）腿髋前迈角（rad） */
export const LUNGE_FRONT_HIP = 0.3

/** 弓步：前腿膝弯曲（rad） */
export const LUNGE_FRONT_KNEE = 0.25

/** 弓步：后（左）腿髋后展角（rad） */
export const LUNGE_BACK_HIP = 0.2

/** 弓步：后腿膝弯曲（rad） */
export const LUNGE_BACK_KNEE = 0.35

/** 弓步重心下沉（m） */
export const LUNGE_SINK = 0.05

/** 弓步各阶段量：windup 微蹲 / strike 满弓步 / spin 低架势 */
export const LUNGE_WINDUP = 0.1
export const LUNGE_STRIKE = 1.0
export const LUNGE_SPIN = 0.35
export const LUNGE_RANGED_AIM = 0.1
export const LUNGE_RANGED_RELEASE = 0.25

/** 状态过渡混合时长（秒）：新状态动画从切换前关节快照收敛，消除关节角突跳 */
export const STATE_BLEND_DURATION = 0.15

// ── 受击硬直 ──

/** 受击后仰幅度（rad，spine.rotation.x 负值 = 向后仰） */
export const FLINCH_SPINE_BACK = 0.25

/** 受击双臂抬举护头（rad，肩 X 前抬） */
export const FLINCH_ARM_RAISE = 0.9

/** 受击双臂外张（rad，肩 Z） */
export const FLINCH_ARM_SPREAD = 0.5

/** 受击屈肘（rad） */
export const FLINCH_ELBOW = 1.2

/** 受击头部后仰（rad） */
export const FLINCH_HEAD_BACK = 0.15

export {darken, lighten}
