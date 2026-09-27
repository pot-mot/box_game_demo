/** 游玩模式相机缩放系数 */
export const ZOOM_SPEED = 0.01
/** 游玩模式相机最小距离 */
export const MIN_DISTANCE = 1
/** 游玩模式相机最大距离 */
export const MAX_DISTANCE = 30
/** 相机平滑跟随速率（1/s）：抑制角色弹跳导致的摄像机抖动 */
export const CAMERA_SMOOTH_FACTOR = 8

/** 锁定目标搜索半径（m，以玩家为圆心） */
export const LOCK_ON_RADIUS = 10
/** 锁定目标相对镜头水平朝向的最大偏角（±60°） */
export const LOCK_ON_HALF_ANGLE = Math.PI / 3
/** 已锁定目标的脱锁半径（m，大于搜索半径形成迟滞，避免目标在边界反复脱锁/重锁） */
export const LOCK_ON_RELEASE_RADIUS = 12
/** 锁定后相机转向目标的角速度系数（1/s，同相机平滑的 EMA 形式） */
export const LOCK_ON_TURN_FACTOR = 10
/** 锁定/取消锁定时视点在玩家与目标之间混合的速率（1/s，同 EMA 形式） */
export const LOCK_ON_BLEND_FACTOR = 8
/** 锁定标记白点直径（m，标记命中锁定点） */
export const LOCK_MARKER_DIAMETER = 0.2

/** 近战命中相机震动：持续时间（秒） */
export const HIT_SHAKE_DURATION = 0.15

/** 近战命中相机震动：最大位移幅度（m，随剩余时间线性衰减） */
export const HIT_SHAKE_AMPLITUDE = 0.05
