/** 重力加速度（Y 轴向下） */
export const GRAVITY = -9.82
/** 物理固定时间步长 */
export const FIXED_TIME_STEP = 1 / 60
/** 每帧最大物理子步数 */
export const MAX_SUB_STEPS = 3
/** 帧间隔上限，防止卡顿时 delta 过大导致物理爆炸 */
export const MAX_DT = 0.05
/** 地面 Y 坐标 */
export const GROUND_Y = 0
/** 箱子之间的摩擦系数 */
export const BOX_BOX_FRICTION = 0.5
/** 箱子与地面的摩擦系数 */
export const BOX_GROUND_FRICTION = 0.3
