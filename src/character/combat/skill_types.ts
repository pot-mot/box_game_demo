import type { MeleeSkillConfig } from './melee_skill.ts'
import type { RangedSkillConfig } from './ranged_skill.ts'

/** 技能类型标识 */
export const SKILL_TYPES = ['melee', 'ranged', 'dash'] as const
export type SkillType = typeof SKILL_TYPES[number]

/** 技能计时通用配置 — 动作时间 / 恢复时间 / 冷却时间三属性，技能总时长 = duration + recovery */
export interface SkillTimingConfig {
    readonly id: string
    /** 动作时间（秒，不含恢复） */
    readonly duration: number
    /** 恢复时间（秒） */
    readonly recovery: number
    /** 冷却时间（秒，0 = 无冷却；非 0 时从触发时刻计时、只挡起手） */
    readonly cooldown: number
}

/** 攻击技能配置联合 — 近战/远程各自独立，不携带对方专属字段（冲刺等移动技能不在此联合内） */
export type SkillConfig = MeleeSkillConfig | RangedSkillConfig

/** 连段守卫上下文：求值时刻的输入快照（纯数据，不依赖 entity 层） */
export interface ComboGuardContext {
    /** 移动输入方向 */
    readonly dx: number
    readonly dz: number
    /** 攻击键按住时长（秒）；点击（松开触发）时约为按下到松开的时长 */
    readonly holdDuration: number
}

/** 连段守卫：决定技能槽能否在起手选择 / 链下一段求值时被触发 */
export type ComboGuard = (ctx: ComboGuardContext) => boolean

/** 技能槽：配置 + 运行时冷却（泛型默认攻击技能联合，冲刺槽用 SkillSlot<DashSkillConfig>） */
export interface SkillSlot<C extends SkillTimingConfig = SkillConfig> {
    readonly config: C
    cooldownTimer: number
    /** 连招链：本技能后可接的技能 ID 列表，按声明顺序求值守卫取第一个通过的（undefined = 无连招） */
    comboChain?: readonly string[]
    /** 链起手槽标记：切链时更新 chainEntryIndex，起手冷却只挂起手槽（触发时开始计时） */
    isChainEntry?: boolean
    /** 触发守卫（可选）：起手选择 / 链下一段求值时返回 false 则跳过本槽（无守卫 = 无条件通过，作为兜底应放在同类候选末尾） */
    readonly triggerGuard?: ComboGuard
    /** 起手槽归属的攻击键组（同组共享同一按键，0 = 轻击键 / 1 = 重击键）；默认 = 槽自身索引 */
    readonly entryGroup?: number
}

/** 创建技能槽 */
export const createSkillSlot = (config: SkillConfig, comboChain?: readonly string[]): SkillSlot => ({
    config,
    cooldownTimer: 0,
    comboChain,
})
