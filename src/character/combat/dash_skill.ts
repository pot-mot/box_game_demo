/** 冲刺持续时间（秒）— 冲刺技能的动作时间 */
export const DASH_DURATION = 0.25
/** 冲刺冷却时间（秒） */
export const DASH_COOLDOWN = 1.0

/**
 * 冲刺技能配置 — 移动技能（属角色能力，不随武器变化）：无恢复段，冷却期间禁止再次冲刺。
 * 原通用的 SkillSlot/SkillTimingConfig 已随槽位模型移除，冲刺保留自身最小配置。
 */
export interface DashSkillConfig {
    readonly id: string
    readonly type: 'dash'
    /** 动作时间（秒） */
    readonly duration: number
    /** 恢复时间（秒） */
    readonly recovery: number
    /** 冷却时间（秒） */
    readonly cooldown: number
}

/** 冲刺技能运行时（配置 + 冷却计时） */
export interface DashSkillRuntime {
    readonly config: DashSkillConfig
    cooldownTimer: number
}

/** 冲刺技能预设 */
export const DASH_SKILL_PRESET: DashSkillConfig = {
    id: 'dash',
    type: 'dash',
    duration: DASH_DURATION,
    recovery: 0,
    cooldown: DASH_COOLDOWN,
}

/** 创建冲刺技能运行时 */
export const createDashSkillRuntime = (): DashSkillRuntime => ({
    config: DASH_SKILL_PRESET,
    cooldownTimer: 0,
})
