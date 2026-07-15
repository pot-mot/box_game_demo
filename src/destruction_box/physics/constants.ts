/** 默认最大耐久度 */
export const DEFAULT_MAX_HEALTH = 8
/** 冲击力 → 伤害系数：impact = relativeVelocity x mass x IMPACT_FORCE_SCALE */
export const IMPACT_FORCE_SCALE = 0.5
/** 碎片存活时间（秒），到期后自动销毁 */
export const DEBRIS_LIFETIME = 5
/** 生成箱子时避让重叠的最大尝试次数 */
export const OVERLAP_MAX_ATTEMPTS = 50
/** 同一来源碰撞冷却时间（秒），防止短时间内重复碰撞导致快速破碎 */
export const COLLISION_COOLDOWN = 0.5
/** 碎片最小数量，碰撞点不足时自动补充随机种子 */
export const MIN_FRAGMENT_COUNT = 2
/** 保留的最近碰撞记录数上限 */
export const MAX_COLLISION_HISTORY = 3
/** 平均碰撞速度 → 碎片弹射速度换算系数 */
export const EJECT_VELOCITY_SCALE = 0.2
