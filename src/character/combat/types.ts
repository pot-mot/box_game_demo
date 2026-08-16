import type { Faction, AttackTendency, TendencyConfig } from '../faction.ts'
import type { SkillSlot } from './skill_types.ts'
import { createDashSkillSlot, type DashSkillConfig } from './dash_skill.ts'
import type { DamageModifier } from './damage.ts'

/** 攻击结果码 */
export const ATTACK_RESULT_CODES = ['ok', 'cooldown', 'dead', 'already_attacking', 'no_valid_skill'] as const
export type AttackResult = typeof ATTACK_RESULT_CODES[number]

/** 角色战斗组件 — 从 CharacterEntity 中分离的所有战斗相关状态 */
export interface CombatComponent {
    skills: SkillSlot[]
    /** 冲刺技能槽（移动技能，独立于攻击技能列表，冷却挡起手） */
    dashSkill: SkillSlot<DashSkillConfig>
    currentSkillIndex: number
    attackActive: boolean
    attackTimer: number
    attackedTargets: Set<number>
    attackDirX: number
    attackDirZ: number

    /** 近战挥砍倾斜角（rad），0=垂直砍，±PI/2=横砍，取自当前段配置的固有倾斜角 */
    swingTilt: number

    /** 攻击阶段索引（0-based），attacking meta-state 推进 */
    phaseIndex: number
    /** 当前阶段已用时间（秒） */
    phaseTimer: number
    /** 本次起链的起手槽索引（决定当前链键组） */
    chainEntryIndex: number
    /** 缓冲的下一段技能索引（-1 = 无缓冲）；段末完整播完后消费推进 */
    bufferedSkillIndex: number
    /** 是否被标记为受击硬直 */
    pendingFlinch: boolean
    /** 受击保护剩余时间（秒）：flinching 退出后的免硬直窗口，防止无限连段把目标永久锁在受击状态；伤害不受影响 */
    flinchImmunityTimer: number

    faction: Faction
    attackTendency: AttackTendency
    tendencyConfig: TendencyConfig
    health: number
    maxHealth: number
    isDead: boolean

    readonly damageModifiers: readonly DamageModifier[]

    onDamageTaken: ((amount: number) => void) | null
    onDamageDealt: ((amount: number) => void) | null
    onDeath: (() => void) | null
}

/** 创建初始化的战斗组件 */
export const createCombatComponent = (
    skills: SkillSlot[],
    faction: Faction,
    attackTendency: AttackTendency,
    tendencyConfig: TendencyConfig,
    maxHealth: number,
): CombatComponent => ({
    skills,
    dashSkill: createDashSkillSlot(),
    currentSkillIndex: 0,
    attackActive: false,
    attackTimer: 0,
    attackedTargets: new Set(),
    attackDirX: 0,
    attackDirZ: 1,
    swingTilt: 0,
    phaseIndex: 0,
    phaseTimer: 0,
    chainEntryIndex: 0,
    bufferedSkillIndex: -1,
    pendingFlinch: false,
    flinchImmunityTimer: 0,
    faction,
    attackTendency,
    tendencyConfig,
    health: maxHealth,
    maxHealth,
    isDead: false,
    damageModifiers: [],
    onDamageTaken: null,
    onDamageDealt: null,
    onDeath: null,
})
