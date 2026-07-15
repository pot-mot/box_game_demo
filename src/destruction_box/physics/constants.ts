/** 默认最大耐久度 */
export const DEFAULT_MAX_HEALTH = 8
/** 冲击力 → 伤害系数：impact = relativeVelocity x mass x IMPACT_FORCE_SCALE */
export const IMPACT_FORCE_SCALE = 0.5
/** Voronoi 分形种子数量，决定碎片数量 */
export const FRAGMENT_SEED_COUNT = 8
/** 破碎时碎片的弹射基础力 */
export const FRAGMENT_EJECT_FORCE = 8
/** 碎片存活时间（秒），到期后自动销毁 */
export const DEBRIS_LIFETIME = 5
/** 生成箱子时避让重叠的最大尝试次数 */
export const OVERLAP_MAX_ATTEMPTS = 50
/** 同一来源碰撞冷却时间（秒），防止短时间内重复碰撞导致快速破碎 */
export const COLLISION_COOLDOWN = 0.5
