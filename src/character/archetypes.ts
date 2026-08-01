/** 攻击类型 */
export const ATTACK_TYPES = ['melee', 'ranged'] as const
export type AttackType = typeof ATTACK_TYPES[number]

/** 近战攻击槽配置 */
export interface MeleeAttackConfig {
    type: 'melee'
    /** MELEE_WEAPON_PRESETS 的 key（可选，默认 'long_sword'） */
    weaponId?: string
    range: number
    damage: number
    cooldown: number
    duration: number
}

/** 远程攻击槽配置 */
export interface RangedAttackConfig {
    type: 'ranged'
    /** RANGED_WEAPON_PRESETS 的 key（可选，默认 'longbow'） */
    weaponId?: string
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
