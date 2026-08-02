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
/** 判定为"地面"的接触法线 Y 分量下限（cos 坡度角）。0.7 → 约 45° */
export const GROUND_NORMAL_THRESHOLD = 0.7
