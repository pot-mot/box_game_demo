/** 弹性箱子额外字段默认值 */
export const ELASTIC_CONFIG_DEFAULTS = {
    stiffness: 30,
    dampingRatio: 0.12,
    maxDeformFraction: 0.5,
}

/** 碰撞冷却时间（秒），避免单次碰撞多次触发 */
export const COLLISION_COOLDOWN = 0.05
/** 碰撞速度→形变速度的缩放系数 */
export const IMPACT_DEFORM_SCALE = 0.35
/** 自重压缩偏移（以 base height 的比例） */
export const GRAVITY_SQUASH = 0.02
