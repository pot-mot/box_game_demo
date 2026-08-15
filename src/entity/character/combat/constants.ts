/** 近战武器物理尺寸 */
export const WEAPON_WIDTH = 0.35
export const WEAPON_HEIGHT = 0.35
export const WEAPON_LENGTH = 1.6
export const WEAPON_COLLISION_GROUP = 16
export const WEAPON_COLLISION_MASK = 1

/** 投掷物 */
export const BULLET_COLLISION_GROUP = 8
export const BULLET_COLLISION_MASK = 0
/** 子弹命中检测半径（需覆盖角色碰撞半径 + 一帧内子弹移动距离） */
export const BULLET_HIT_RADIUS = 1.2
export const BULLET_SIZE = 0.1

/** 近战命中顿帧：持续时间（秒，真实时间） */
export const HITSTOP_DURATION = 0.07

/** 近战命中顿帧：时间缩放（角色子系统 dt 乘数，趋近 0 = 冻结） */
export const HITSTOP_TIMESCALE = 0.05
