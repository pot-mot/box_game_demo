/** 攻击类型 */
export const ATTACK_TYPES = ['melee', 'ranged'] as const
export type AttackType = typeof ATTACK_TYPES[number]

/** 近战攻击槽配置 */
export interface MeleeAttackConfig {
    type: 'melee'
    range: number
    damage: number
    cooldown: number
    duration: number
}

/** 远程攻击槽配置 */
export interface RangedAttackConfig {
    type: 'ranged'
    range: number
    damage: number
    cooldown: number
    duration: number
    bulletSpeed: number
    bulletKnockback: number
    bulletLifetime: number
}

/** 攻击槽联合 */
export type AttackConfig = MeleeAttackConfig | RangedAttackConfig

/** 远程子弹运行时配置 */
export interface BulletConfig {
    speed: number
    size: number
    damage: number
    knockbackForce: number
    lifetime: number
}

/** 默认子弹尺寸 */
export const BULLET_SIZE = 0.1

/** 攻击槽预设 */
export const ATTACK_PRESETS = {
    melee: {
        type: 'melee' as const,
        range: 1.5,
        damage: 3,
        cooldown: 0.5,
        duration: 0.3,
    },
    ranged: {
        type: 'ranged' as const,
        range: 10,
        damage: 2,
        cooldown: 0.8,
        duration: 0.2,
        bulletSpeed: 20,
        bulletKnockback: 3,
        bulletLifetime: 3,
    },
}

/** 攻击槽默认血量 */
export const ATTACK_DEFAULT_MAX_HEALTH: Record<AttackType, number> = {
    melee: 15,
    ranged: 8,
}

/** 攻击槽默认探测范围 */
export const ATTACK_DEFAULT_DETECTION_RANGE: Record<AttackType, number> = {
    melee: 8,
    ranged: 12,
}
