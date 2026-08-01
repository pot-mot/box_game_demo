/** 技能类型标识 */
export const SKILL_TYPES = ['melee', 'ranged'] as const
export type SkillType = typeof SKILL_TYPES[number]

/** 技能静态配置 — 统一近战/远程 */
export interface SkillConfig {
    readonly id: string
    readonly type: SkillType
    readonly damage: number
    readonly range: number
    readonly cooldown: number
    readonly duration: number
    readonly knockbackForce: number
    readonly knockbackY: number
    readonly projectileSpeed: number
    readonly projectileLifetime: number
}

/** 技能槽：配置 + 运行时冷却 */
export interface SkillSlot {
    readonly config: SkillConfig
    cooldownTimer: number
}

/** 创建技能槽 */
export const createSkillSlot = (config: SkillConfig): SkillSlot => ({
    config,
    cooldownTimer: 0,
})

/** 技能预设库 — 替代原 AttackConfig 二态 */
export const SKILL_PRESETS: Record<string, SkillConfig> = {
    default_melee: {
        id: 'default_melee',
        type: 'melee',
        damage: 3,
        range: 1.5,
        cooldown: 0.5,
        duration: 0.3,
        knockbackForce: 5,
        knockbackY: 2,
        projectileSpeed: 0,
        projectileLifetime: 0,
    },
    default_ranged: {
        id: 'default_ranged',
        type: 'ranged',
        damage: 2,
        range: 10,
        cooldown: 0.8,
        duration: 0.2,
        knockbackForce: 3,
        knockbackY: 1,
        projectileSpeed: 20,
        projectileLifetime: 3,
    },
}

/** 技能类型默认血量 */
export const SKILL_DEFAULT_MAX_HEALTH: Record<SkillType, number> = {
    melee: 15,
    ranged: 8,
}

/** 技能类型默认探测范围 */
export const SKILL_DEFAULT_DETECTION_RANGE: Record<SkillType, number> = {
    melee: 8,
    ranged: 12,
}
