/** 可破坏箱子额外字段默认值 */
export const DESTRUCTIBLE_CONFIG_DEFAULTS = {
    maxHealth: 8,
}

/** 碰撞冲击力 → 伤害的缩放系数 */
export const IMPACT_FORCE_SCALE = 0.5
/** 碰撞冷却时间（秒），防止连续碰撞重复触发 */
export const COLLISION_COOLDOWN = 0.5
/** 最少碎片生成数量 */
export const MIN_FRAGMENT_COUNT = 2
/** 碰撞历史记录保留数量 */
export const MAX_COLLISION_HISTORY = 3
/** 碎片弹射速度缩放系数 */
export const EJECT_VELOCITY_SCALE = 0.05
