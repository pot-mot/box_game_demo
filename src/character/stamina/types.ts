import type {CharacterStateName} from "../state_machine/state_names.ts";

/** 进入状态时一次性扣除体力的动作 */
export const STAMINA_ENTRY_ACTIONS = ['attack', 'roll', 'jump'] as const
export type StaminaEntryAction = typeof STAMINA_ENTRY_ACTIONS[number]

/** 处于状态时按时间持续扣除体力的状态 */
export const STAMINA_DRAIN_STATES = ['sprinting', 'flying', 'blocking'] as const satisfies readonly CharacterStateName[]
export type StaminaDrainState = typeof STAMINA_DRAIN_STATES[number]

/** 角色体力的基础配置（记录在 CharacterConfig，可被面板编辑） */
export interface StaminaConfig {
    /** 体力上限基础值（缺省 = `DEFAULT_STAMINA_MAX`） */
    readonly max?: number
    /** 扣除后延迟恢复时长（秒，缺省 = `DEFAULT_STAMINA_REGEN_DELAY`） */
    readonly regenDelay?: number
    /** 延迟结束后每秒恢复值（缺省 = `DEFAULT_STAMINA_REGEN_PER_SEC`） */
    readonly regenPerSec?: number
    /** 进入一次性动作状态的消耗基础值（缺省逐项 = `DEFAULT_STAMINA_ENTRY_COST`） */
    readonly entryCost?: Partial<Record<StaminaEntryAction, number>>
    /** 持续状态每秒消耗基础值（缺省逐项 = `DEFAULT_STAMINA_DRAIN_PER_SEC`） */
    readonly drainPerSec?: Partial<Record<StaminaDrainState, number>>
}

/**
 * 装备 / 武器提供的体力修正（乘区，1 = 无修正）：
 * 多件来源逐项相乘，最终有效消耗 / 恢复速度 = 角色基础值 × 修正。
 */
export interface StaminaModifierSet {
    /** 进入动作消耗乘数（< 1 降低消耗，> 1 提高消耗） */
    readonly entry?: Partial<Record<StaminaEntryAction, number>>
    /** 持续状态消耗乘数 */
    readonly drain?: Partial<Record<StaminaDrainState, number>>
    /** 体力恢复速度乘数 */
    readonly regen?: number
}

/** 合并后的有效体力修正 */
export interface StaminaModifiers {
    readonly entry: Readonly<Record<StaminaEntryAction, number>>
    readonly drain: Readonly<Record<StaminaDrainState, number>>
    readonly regen: number
}

/** 角色运行时体力子域（唯一权威数据；由状态机 / 世界步进与装备系统写入） */
export interface CharacterStaminaState {
    current: number
    max: number
    /** 扣除后延迟恢复时长（秒，已应用装备乘区不影响该时长） */
    regenDelay: number
    /** 距离开始恢复的剩余时间（秒） */
    regenDelayTimer: number
    /** 有效每秒恢复速度（基础值 × 装备乘区） */
    regenPerSec: number
    /** 有效一次性动作消耗（基础值 × 装备乘区） */
    entryCost: Readonly<Record<StaminaEntryAction, number>>
    /** 有效持续状态每秒消耗（基础值 × 装备乘区） */
    drainPerSec: Readonly<Record<StaminaDrainState, number>>
    /** 当前生效的装备 / 武器修正（面板公式拆解与调试读取） */
    modifiers: StaminaModifiers
}
