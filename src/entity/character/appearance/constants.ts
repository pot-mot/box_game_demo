/** 头部肤色 */
export const HEAD_COLOR = 0xf0c8a0

/** 身体上衣颜色 */
export const BODY_COLOR = 0xe06040

/** 腿部裤子颜色 */
export const LEG_COLOR = 0x303050

/** 近战武器颜色 */
export const MELEE_WEAPON_COLOR = 0xff3333

/** 远程武器颜色 */
export const RANGED_WEAPON_COLOR = 0x3388ff

/** 近战棍尺寸 (宽 × 高 × 深) */
export const MELEE_WEAPON_SIZE: [number, number, number] = [0.05, 0.6, 0.05]

/** 远程法杖尺寸 (宽 × 高 × 深) */
export const RANGED_WEAPON_SIZE: [number, number, number] = [0.05, 0.8, 0.05]

/** 武器相对手部 pivot 的 Y 偏移（向上延伸） */
export const WEAPON_Y_OFFSET = 0.15

/** 身体部位比例（头 : 身 : 腿 = 2 : 4 : 4） */
export const HEAD_RATIO = 0.2
export const BODY_RATIO = 0.4
export const LEG_RATIO = 0.4

/** 肢体宽度系数（相对于 radius * 2 即身宽） */
export const ARM_WIDTH_RATIO = 0.4
export const LEG_WIDTH_RATIO = 0.5

/** 手臂X轴偏移（距离身体侧边的额外间距） */
export const ARM_X_GAP = 0.02

/** 腿部X轴偏移（距离身体中心线的间距） */
export const LEG_X_GAP = 0.04

/** 模型材质粗糙度 */
export const MODEL_ROUGHNESS = 0.6

/** 行走速度归一化上限（m/s），用于动画周期计算 */
export const WALK_ANIM_MAX_SPEED = 6.0

/** 身体朝向旋转速度（rad/s） */
export const ROTATION_SPEED = 10

/** 速度低于此阈值时不更新目标朝向（m/s） */
export const VELOCITY_DIR_THRESHOLD = 0.05

/** 头部水平旋转相对身体的最大角度（rad），±90° */
export const HEAD_TURN_LIMIT = Math.PI / 2
