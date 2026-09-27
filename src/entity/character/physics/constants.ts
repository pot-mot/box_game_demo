export const CHARACTER_LINEAR_DAMPING = 0.2
export const GROUND_VELOCITY_THRESHOLD = 0.05
/** 角色重叠分离的附加速度踢（每边一半，仅辅助防回穿；位置修正才是主要分离手段，过大易把对方弹飞） */
export const CHARACTER_SEPARATION_SPEED = 8
/** 分离坡面补偿生效的支撑面法线 Y 下限（0.5 → 60°；更陡的坡不补偿，避免法线噪声放大位移） */
export const SEPARATION_SLOPE_MIN_NY = 0.5
