import type { Faction, AttackTendency, TendencyConfig } from '../faction.ts'
import type { AttackSegment, WeaponAttacks } from '../weapon/attack_chain.ts'
import type { WeaponConfig } from '../weapon/catalog.ts'
import type { WeaponRuntime } from '../weapon/weapon_runtime.ts'
import { createDashSkillRuntime, type DashSkillRuntime } from './dash_skill.ts'
import type { DamageEvent, DamageModifier } from './damage.ts'

/** 攻击结果码 */
export const ATTACK_RESULT_CODES = ['ok', 'cooldown', 'dead', 'already_attacking', 'no_valid_skill'] as const
export type AttackResult = typeof ATTACK_RESULT_CODES[number]

/**
 * 角色战斗组件 — 从 CharacterEntity 中分离的所有战斗相关状态。
 *
 * 攻击动作模型（无槽位）：角色只持有**装备武器**（含数值覆写）与其**武器攻击链**；
 * 当前段 / 缓冲段以段定义对象表达（不再有 currentSkillIndex / chainEntryIndex / comboChain 索引），
 * 连段推进由段自身声明的 next 转换决定（见 `states/attacking/`）。
 */
export interface CombatComponent {
    /** 装备武器（含伤害 / 远程弹道数值覆写） */
    weapon: WeaponConfig
    /** 攻击链（武器固有段定义 + 起手段冷却覆写）；换武器时由 `setCombatWeapon` 同步更新 */
    attacks: WeaponAttacks

    /** 段冷却剩余（秒）：段 id → 剩余时间（仅非 0 冷却的起手段写入） */
    readonly segmentCooldowns: Map<string, number>

    /** 当前攻击段（attacking 期间有效；未攻击时 undefined） */
    activeSegment: AttackSegment | undefined
    /** 缓冲的下一段（段播完由段转换 / 异键起手解析消费） */
    bufferedSegment: AttackSegment | undefined

    attackActive: boolean
    /** 当前段累计时间（动作 + 恢复全程，秒） */
    attackTimer: number
    /** 当前段攻击方向（起手时由输入方向快照） */
    attackDirX: number
    attackDirZ: number
    attackedTargets: Set<number>

    /** 当前段阶段索引（0-based），attacking meta-state 推进 */
    phaseIndex: number
    /** 当前阶段已用时间（秒） */
    phaseTimer: number

    /** 是否被标记为受击硬直 */
    pendingFlinch: boolean
    /** 受击保护剩余时间（秒）：flinching 退出后的免硬直窗口，防止无限连段把目标永久锁在受击状态；伤害不受影响 */
    flinchImmunityTimer: number

    /** 冲刺技能（移动技能，属角色能力而非武器；冷却挡起手） */
    dashSkill: DashSkillRuntime

    faction: Faction
    attackTendency: AttackTendency
    tendencyConfig: TendencyConfig
    health: number
    maxHealth: number
    isDead: boolean

    readonly damageModifiers: readonly DamageModifier[]

    onDamageTaken: ((amount: number, event: DamageEvent) => void) | null
    onDamageDealt: ((amount: number) => void) | null
    onDeath: (() => void) | null
}

/** 换装/数值覆写变更：整体替换武器运行时（攻击链同步跟随） */
export const setCombatWeapon = (c: CombatComponent, runtime: WeaponRuntime): void => {
    c.weapon = runtime.weapon
    c.attacks = runtime.attacks
}

/** 创建初始化的战斗组件（武器运行时 + 阵营/倾向/血量） */
export const createCombatComponent = (
    runtime: WeaponRuntime,
    faction: Faction,
    attackTendency: AttackTendency,
    tendencyConfig: TendencyConfig,
    maxHealth: number,
): CombatComponent => ({
    weapon: runtime.weapon,
    attacks: runtime.attacks,
    segmentCooldowns: new Map(),
    activeSegment: undefined,
    bufferedSegment: undefined,
    attackActive: false,
    attackTimer: 0,
    attackDirX: 0,
    attackDirZ: 1,
    attackedTargets: new Set(),
    phaseIndex: 0,
    phaseTimer: 0,
    pendingFlinch: false,
    flinchImmunityTimer: 0,
    dashSkill: createDashSkillRuntime(),
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
