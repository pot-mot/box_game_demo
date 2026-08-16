import type {SkillSlot, SkillTimingConfig} from './skill_types.ts'

/** 冲刺持续时间（秒）— 冲刺技能的动作时间 */
export const DASH_DURATION = 0.25
/** 冲刺冷却时间（秒） */
export const DASH_COOLDOWN = 1.0

/** 冲刺技能配置 — 移动技能：无武器、无恢复段，冷却期间禁止再次冲刺 */
export interface DashSkillConfig extends SkillTimingConfig {
    readonly type: 'dash'
}

/** 冲刺技能预设 */
export const DASH_SKILL_PRESET: DashSkillConfig = {
    id: 'dash',
    type: 'dash',
    duration: DASH_DURATION,
    recovery: 0,
    cooldown: DASH_COOLDOWN,
}

/** 创建冲刺技能槽 */
export const createDashSkillSlot = (): SkillSlot<DashSkillConfig> => ({
    config: DASH_SKILL_PRESET,
    cooldownTimer: 0,
})
