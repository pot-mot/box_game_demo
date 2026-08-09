import type { Faction, AttackTendency, TendencyConfig } from '../faction.ts'
import type { SkillSlot } from './skill_types.ts'
import type { DamageModifier } from './damage.ts'

/** 攻击结果码 */
export const ATTACK_RESULT_CODES = ['ok', 'cooldown', 'dead', 'already_attacking', 'no_valid_skill'] as const
export type AttackResult = typeof ATTACK_RESULT_CODES[number]

/** 角色战斗组件 — 从 CharacterEntity 中分离的所有战斗相关状态 */
export interface CombatComponent {
    skills: SkillSlot[]
    currentSkillIndex: number
    attackActive: boolean
    attackTimer: number
    attackedTargets: Set<number>
    attackDirX: number
    attackDirZ: number

    /** 近战挥砍倾斜角（rad），0=垂直砍，±PI/2=横砍，于进入 attacking 状态时随机 */
    swingTilt: number

    /** 攻击阶段索引（0-based），attacking meta-state 推进 */
    phaseIndex: number
    /** 当前阶段已用时间（秒） */
    phaseTimer: number
    /** 连招链当前位置（0 = 第一招） */
    comboIndex: number
    /** 连招输入窗口计时器（秒，到期归零终止连招） */
    comboTimer: number
    /** 是否被标记为受击硬直 */
    pendingFlinch: boolean

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
    currentSkillIndex: 0,
    attackActive: false,
    attackTimer: 0,
    attackedTargets: new Set(),
    attackDirX: 0,
    attackDirZ: 1,
    swingTilt: 0,
    phaseIndex: 0,
    phaseTimer: 0,
    comboIndex: 0,
    comboTimer: 0,
    pendingFlinch: false,
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
