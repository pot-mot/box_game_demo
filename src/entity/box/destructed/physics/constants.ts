import type {DestructibleConfig} from '../types'

/** 可破坏箱子默认配置 */
export const DEFAULT_DESTRUCTIBLE_CONFIG: DestructibleConfig = {
    width: 1,
    height: 1,
    depth: 1,
    mass: 1,
    friction: 0.3,
    maxHealth: 8,
}
/** 碰撞冲击力 → 伤害的缩放系数 */
export const IMPACT_FORCE_SCALE = 0.5
/** 碎片存续时间（秒） */
export const DEBRIS_LIFETIME = 5
/** 碰撞冷却时间（秒），防止连续碰撞重复触发 */
export const COLLISION_COOLDOWN = 0.5
/** 最少碎片生成数量 */
export const MIN_FRAGMENT_COUNT = 2
/** 碰撞历史记录保留数量 */
export const MAX_COLLISION_HISTORY = 3
/** 碎片弹射速度缩放系数 */
export const EJECT_VELOCITY_SCALE = 0.05
