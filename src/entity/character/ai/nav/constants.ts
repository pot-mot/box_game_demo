/** 默认导航感知配置 */
export const DEFAULT_CHECK_RADIUS = 0.5
export const DEFAULT_CHECK_DISTANCE = 1.5
export const DEFAULT_STUCK_TIMEOUT = 2.0

/** 绕行最小/最大偏转角（弧度） */
export const STEER_ANGLE_MIN = Math.PI / 4       // 45°
export const STEER_ANGLE_MAX = Math.PI / 2       // 90°
export const STEER_ANGLE_STEP = Math.PI / 12     // 15°

/** 可行走表面的最小面法线 Y 分量（与角色状态机 SLOPE_WALK_THRESHOLD 一致） */
export const WALKABLE_NORMAL_MIN_Y = 0.06

/** 卡住判定距离阈值 */
export const STUCK_DIST_THRESHOLD = 0.01

/** stuck 状态倒退逃逸脉冲时长（秒）：卡住超过 stuckTimeout 后朝意图反向倒退 + 跳跃尝试物理挣脱 */
export const STUCK_ESCAPE_DURATION = 0.5

/** 单次 stuck episode 内连续倒退逃逸脉冲上限：耗尽后停止原地重复反向跳，
 *  交由决策层静止检测兜底（绕行/重掷/放弃战斗），避免坑底/墙角无限连跳 */
export const STUCK_ESCAPE_MAX_RETRIES = 2

/** 射线垂直仰角采样（弧度） */
export const RAY_PITCH_ANGLES = [0, Math.PI / 18] // 0°, 10°

/** 射线水平角采样（弧度：前方扇面） */
export const RAY_HORIZONTAL_ANGLES: readonly number[] = [
    -Math.PI / 4,   // -45°
    -Math.PI / 6,   // -30°
    -Math.PI / 12,  // -15°
    0,
    Math.PI / 12,   // +15°
    Math.PI / 6,    // +30°
    Math.PI / 4,    // +45°
]

/** 侧向扫描水平角（弧度：判断左右通路） */
export const SIDE_SCAN_ANGLES: readonly number[] = [
    -Math.PI / 2,   // -90°
    -Math.PI / 3,   // -60°
    Math.PI / 3,    // +60°
    Math.PI / 2,    // +90°
]
