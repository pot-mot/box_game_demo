import type {CombatComponent} from '../combat/types.ts'
import {resolveEquipmentPieces} from '../armor/catalog.ts'
import type {CharacterConfig} from '../state/types.ts'
import type {CharacterStateName} from '../state_machine/state_names.ts'
import type {
    CharacterStaminaState,
    StaminaConfig,
    StaminaDrainState,
    StaminaEntryAction,
    StaminaModifierSet,
    StaminaModifiers,
} from './types.ts'
import {STAMINA_DRAIN_STATES, STAMINA_ENTRY_ACTIONS} from './types.ts'
import {
    DEFAULT_STAMINA_DRAIN_PER_SEC,
    DEFAULT_STAMINA_ENTRY_COST,
    DEFAULT_STAMINA_MAX,
    DEFAULT_STAMINA_REGEN_DELAY,
    DEFAULT_STAMINA_REGEN_PER_SEC,
    STAMINA_SUSTAINED_ENTRY_MIN_RATIO,
} from './constants.ts'

/** 解析角色体力基础配置（旧角色缺字段时安全回退默认） */
export const resolveStaminaConfig = (config: CharacterConfig): {
    readonly max: number
    readonly regenDelay: number
    readonly regenPerSec: number
    readonly entryCost: Readonly<Record<StaminaEntryAction, number>>
    readonly drainPerSec: Readonly<Record<StaminaDrainState, number>>
} => {
    const stamina: StaminaConfig | undefined = config.stamina
    return {
        max: positiveOr(stamina?.max, DEFAULT_STAMINA_MAX),
        regenDelay: nonNegativeOr(stamina?.regenDelay, DEFAULT_STAMINA_REGEN_DELAY),
        regenPerSec: nonNegativeOr(stamina?.regenPerSec, DEFAULT_STAMINA_REGEN_PER_SEC),
        entryCost: {
            attack: nonNegativeOr(stamina?.entryCost?.attack, DEFAULT_STAMINA_ENTRY_COST),
            roll: nonNegativeOr(stamina?.entryCost?.roll, DEFAULT_STAMINA_ENTRY_COST),
            jump: nonNegativeOr(stamina?.entryCost?.jump, DEFAULT_STAMINA_ENTRY_COST),
        },
        drainPerSec: {
            sprinting: nonNegativeOr(stamina?.drainPerSec?.sprinting, DEFAULT_STAMINA_DRAIN_PER_SEC),
            flying: nonNegativeOr(stamina?.drainPerSec?.flying, DEFAULT_STAMINA_DRAIN_PER_SEC),
            blocking: nonNegativeOr(stamina?.drainPerSec?.blocking, DEFAULT_STAMINA_DRAIN_PER_SEC),
        },
    }
}

const positiveOr = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback

const nonNegativeOr = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback

const identityModifiers = (): StaminaModifiers => ({
    entry: {attack: 1, roll: 1, jump: 1},
    drain: {sprinting: 1, flying: 1, blocking: 1},
    regen: 1,
})

/** 把多个来源的体力修正逐项相乘（1 = 无修正；非法 / 非正数按 1 处理） */
export const combineStaminaModifiers = (
    sources: readonly (StaminaModifierSet | undefined)[],
): StaminaModifiers => {
    const result = identityModifiers()
    const entry: Record<StaminaEntryAction, number> = {...result.entry}
    const drain: Record<StaminaDrainState, number> = {...result.drain}
    let regen = result.regen
    for (const source of sources) {
        if (source === undefined) continue
        for (const action of STAMINA_ENTRY_ACTIONS) {
            entry[action] *= multiplierOr(source.entry?.[action])
        }
        for (const state of STAMINA_DRAIN_STATES) {
            drain[state] *= multiplierOr(source.drain?.[state])
        }
        regen *= multiplierOr(source.regen)
    }
    return {entry, drain, regen}
}

const multiplierOr = (value: number | undefined): number =>
    value !== undefined && Number.isFinite(value) && value > 0 ? value : 1

/** 当前装备（全部武器槽 + 护甲 / 肢体）提供的体力修正汇总 */
export const staminaModifiersOf = (combat: CombatComponent | undefined, bodyFormId: string): StaminaModifiers => {
    const sources: StaminaModifierSet[] = []
    if (combat?.weapons !== undefined) {
        for (const runtime of combat.weapons.values()) {
            if (runtime.weapon.stamina !== undefined) sources.push(runtime.weapon.stamina)
        }
    }
    if (combat?.equipment !== undefined) {
        for (const piece of resolveEquipmentPieces(combat.equipment, bodyFormId)) {
            if (piece.stamina !== undefined) sources.push(piece.stamina)
        }
    }
    return combineStaminaModifiers(sources)
}

const applyModifiers = (
    base: ReturnType<typeof resolveStaminaConfig>,
    modifiers: StaminaModifiers,
): Pick<CharacterStaminaState, 'max' | 'regenDelay' | 'regenPerSec' | 'entryCost' | 'drainPerSec' | 'modifiers'> => ({
    max: base.max,
    regenDelay: base.regenDelay,
    regenPerSec: base.regenPerSec * modifiers.regen,
    entryCost: {
        attack: base.entryCost.attack * modifiers.entry.attack,
        roll: base.entryCost.roll * modifiers.entry.roll,
        jump: base.entryCost.jump * modifiers.entry.jump,
    },
    drainPerSec: {
        sprinting: base.drainPerSec.sprinting * modifiers.drain.sprinting,
        flying: base.drainPerSec.flying * modifiers.drain.flying,
        blocking: base.drainPerSec.blocking * modifiers.drain.blocking,
    },
    modifiers,
})

/** 按角色配置 + 当前装备创建体力子域（初始满体力） */
export const createStaminaState = (
    config: CharacterConfig,
    combat: CombatComponent | undefined,
    bodyFormId: string,
): CharacterStaminaState => {
    const profile = applyModifiers(resolveStaminaConfig(config), staminaModifiersOf(combat, bodyFormId))
    return {
        current: profile.max,
        ...profile,
        regenDelayTimer: 0,
    }
}

/** 装备 / 配置变更后重算有效消耗与恢复速度；当前体力与延迟计时保留并按新上限夹取 */
export const refreshStaminaProfile = (
    stamina: CharacterStaminaState,
    config: CharacterConfig,
    combat: CombatComponent,
    bodyFormId: string,
): void => {
    const profile = applyModifiers(resolveStaminaConfig(config), staminaModifiersOf(combat, bodyFormId))
    stamina.max = profile.max
    stamina.regenDelay = profile.regenDelay
    stamina.regenPerSec = profile.regenPerSec
    stamina.entryCost = profile.entryCost
    stamina.drainPerSec = profile.drainPerSec
    stamina.modifiers = profile.modifiers
    if (stamina.current > stamina.max) stamina.current = stamina.max
    if (stamina.regenDelayTimer > stamina.regenDelay) stamina.regenDelayTimer = stamina.regenDelay
}

/** 是否拥有足够体力进入持续状态（跑步 / 格挡）：耗尽退出后需恢复到上限的一定比例，避免按住按键反复进出 */
export const canEnterSustainedStamina = (stamina: CharacterStaminaState): boolean =>
    stamina.current >= Math.max(0.01, stamina.max * STAMINA_SUSTAINED_ENTRY_MIN_RATIO)

/** 是否拥有足够体力进入一次性动作状态（消耗为 0 时恒可进入） */
export const canAffordStaminaEntry = (
    stamina: CharacterStaminaState,
    action: StaminaEntryAction,
): boolean => stamina.current + 1e-9 >= stamina.entryCost[action]

/** 扣除一次性动作体力并重置恢复延迟（不足时扣到 0） */
export const spendStaminaEntry = (
    stamina: CharacterStaminaState,
    action: StaminaEntryAction,
): void => {
    const cost = stamina.entryCost[action]
    if (cost <= 0) return
    stamina.current = Math.max(0, stamina.current - cost)
    stamina.regenDelayTimer = stamina.regenDelay
}

/** 持续状态体力扣除或延迟恢复（每物理步调用；返回本步是否仍有体力） */
export const updateStamina = (
    stamina: CharacterStaminaState,
    state: CharacterStateName,
    dt: number,
): void => {
    const draining = STAMINA_DRAIN_STATES.find(candidate => candidate === state)
    if (draining !== undefined) {
        const rate = stamina.drainPerSec[draining]
        if (rate > 0 && stamina.current > 0) {
            stamina.current = Math.max(0, stamina.current - rate * dt)
            stamina.regenDelayTimer = stamina.regenDelay
        }
        return
    }
    if (stamina.regenDelayTimer > 0) {
        stamina.regenDelayTimer = Math.max(0, stamina.regenDelayTimer - dt)
        return
    }
    if (stamina.current < stamina.max) {
        stamina.current = Math.min(stamina.max, stamina.current + stamina.regenPerSec * dt)
    }
}

/** 当前是否处于体力耗尽状态（用于持续状态退出守卫） */
export const isStaminaExhausted = (stamina: CharacterStaminaState): boolean => stamina.current <= 0
