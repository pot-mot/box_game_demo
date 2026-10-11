/** 锁定目标搜索半径（m，以玩家为圆心） */
export const LOCK_ON_RADIUS = 10
/** 锁定目标相对镜头水平朝向的最大偏角（±60°） */
export const LOCK_ON_HALF_ANGLE = Math.PI / 3
/** 已锁定目标的脱锁半径（m，大于搜索半径形成迟滞，避免目标在边界反复脱锁/重锁） */
export const LOCK_ON_RELEASE_RADIUS = 12
/** 锁定标记白点直径（m，标记命中锁定点） */
export const LOCK_MARKER_DIAMETER = 0.2

/** 近战命中相机震动：持续时间（秒） */
export const HIT_SHAKE_DURATION = 0.15

/** 近战命中相机震动：最大位移幅度（m，随剩余时间线性衰减） */
export const HIT_SHAKE_AMPLITUDE = 0.05
