/** 可破坏特性配置默认值（`fragmentCount` = 碎裂目标块数） */
export const DESTRUCTIBLE_DEFAULTS = {
    maxHealth: 8,
    fragmentCount: 6,
}

/** 碎裂目标块数上下限 */
export const FRAGMENT_COUNT_MIN = 2
export const FRAGMENT_COUNT_MAX = 24

/** 燃烧特性配置默认值 */
export const BURNING_DEFAULTS = {
    maxHealth: 10,
}

/** 磁力特性配置默认值 */
export const MAGNET_DEFAULTS = {
    attractionRadius: 5,
    attractionStrength: 3,
}

/** 弹性特性配置默认值 */
export const ELASTIC_DEFAULTS = {
    stiffness: 30,
    dampingRatio: 0.12,
    maxDeformFraction: 0.5,
}

// ── 可破坏特性运行时调参 ──
/** 碰撞冲击力 → 伤害的缩放系数 */
export const IMPACT_FORCE_SCALE = 0.5
/** 可破坏特性碰撞冷却时间（秒），防止连续碰撞重复触发 */
export const DESTRUCTIBLE_COLLISION_COOLDOWN = 0.5
/** 最少碎片生成数量 */
export const MIN_FRAGMENT_COUNT = 2
/** 碰撞历史记录保留数量 */
export const MAX_COLLISION_HISTORY = 3
/** 碎片弹射速度缩放系数 */
export const EJECT_VELOCITY_SCALE = 0.05

// ── 弹性特性运行时调参 ──
/** 弹性特性碰撞冷却时间（秒），避免单次碰撞多次触发 */
export const ELASTIC_COLLISION_COOLDOWN = 0.05
/** 碰撞速度 → 形变速度的缩放系数 */
export const IMPACT_DEFORM_SCALE = 0.35
/** 自重压缩偏移（以 base height 的比例） */
export const GRAVITY_SQUASH = 0.02

// ── 磁力特性运行时调参 ──
/** 被吸引物体的最大线速度，防止碰撞弹飞 */
export const MAGNET_MAX_SPEED = 8
