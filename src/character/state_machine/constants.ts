export const GROUND_DAMPING = 0.85
export const AIR_DAMPING = 0.95
/** 空中转向速度（每帧向目标方向靠拢的比例，0~1，越小越迟缓） */
export const AIR_CONTROL_FACTOR = 0.15
/** 冲刺速度倍率 */
export const DASH_SPEED_MULTIPLIER = 2
/** 冲刺持续时间（秒） */
export const DASH_DURATION = 0.25
/** 冲刺冷却时间（秒） */
export const DASH_COOLDOWN = 1.0
/** 斜坡行走法线 Y 分量下限（cos 坡度角）。0.06 → 约 86.6°，覆盖 85° 以下斜坡；90° 垂直面（ny=0）不算着地 */
export const SLOPE_WALK_THRESHOLD = 0.06
/** 从 falling 恢复到行走的法线 Y 分量下限（滞回，高于 SLOPE_WALK_THRESHOLD，防止边界抖动） */
export const SLOPE_RECOVER_THRESHOLD = 0.08
/** 郊狼时间：脱离地面后仍判定为着地的宽限期（秒），覆盖下坡弹跳的短暂悬空，防止误触发 falling */
export const GROUND_KEEP_TIME = 0.3
/** 宽限期内向支撑面吸附的速率（m/s）：弹跳悬空时快速落回坡面 */
export const SLOPE_SINK_SPEED = 3
/** falling 状态沿支撑面滑动的法线 Y 下限（0.3 → 约 72°；低于此的贴墙接触不投影，保留重力下落） */
export const FALL_SLIDE_MIN_NY = 0.3
/** 下落时总速度上限倍率（限制陡坡下滑/坠落无限加速） */
export const FALL_MAX_SPEED_MULTIPLIER = 2
/** 状态翻转防抖：walking/idle/falling 之间切换的最低驻留时间（秒），防止接触法线噪声/下坡弹跳导致抖动 */
export const STATE_FLIP_MIN_TIME = 0.15
