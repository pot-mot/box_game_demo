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
