import type { MeleeSkillConfig } from './melee_skill.ts'
import type { RangedSkillConfig } from './ranged_skill.ts'

/** 技能类型标识 */
export const SKILL_TYPES = ['melee', 'ranged'] as const
export type SkillType = typeof SKILL_TYPES[number]

/** 技能配置联合 — 近战/远程各自独立，不携带对方专属字段 */
export type SkillConfig = MeleeSkillConfig | RangedSkillConfig

/** 技能槽：配置 + 运行时冷却 */
export interface SkillSlot {
    readonly config: SkillConfig
    cooldownTimer: number
    /** 连招链：本技能后可接的技能 ID 列表，按顺序执行（undefined = 无连招） */
    comboChain?: readonly string[]
}

/** 创建技能槽 */
export const createSkillSlot = (config: SkillConfig, comboChain?: readonly string[]): SkillSlot => ({
    config,
    cooldownTimer: 0,
    comboChain,
})
