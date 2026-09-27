/** 翻滚持续时间（秒）— 翻滚技能的动作时间 */
export const ROLL_DURATION = 0.6
/** 翻滚冷却时间（秒） */
export const ROLL_COOLDOWN = 1.0
/** 翻滚无敌帧起点（秒，自动作开始）：起手与收招可被命中，仅中段窗口免疫伤害 */
export const ROLL_IFRAME_START = 0.15
/** 翻滚无敌帧终点（秒，自动作开始） */
export const ROLL_IFRAME_END = 0.45

/**
 * 翻滚技能配置 — 移动技能（属角色能力，不随武器变化）：无恢复段，冷却期间禁止再次翻滚。
 * `iframeStart` / `iframeEnd` 描述无敌帧窗口（动作时间内的起止秒数），由 rolling 状态逐帧转入
 * `CombatComponent.invincibleTimer`，伤害结算（applyDamage）据此完全免疫。
 */
export interface RollSkillConfig {
    readonly id: string
    readonly type: 'roll'
    /** 动作时间（秒） */
    readonly duration: number
    /** 恢复时间（秒） */
    readonly recovery: number
    /** 冷却时间（秒） */
    readonly cooldown: number
    /** 无敌帧窗口起点（秒，自动作开始） */
    readonly iframeStart: number
    /** 无敌帧窗口终点（秒，自动作开始） */
    readonly iframeEnd: number
}

/** 翻滚技能运行时（配置 + 冷却计时 + 锁定方向） */
export interface RollSkillRuntime {
    readonly config: RollSkillConfig
    cooldownTimer: number
    /** 当前翻滚方向（世界水平单位向量，进入翻滚时锁定；无进行中翻滚时保留上一次方向） */
    dirX: number
    dirZ: number
}

/** 翻滚技能预设 */
export const ROLL_SKILL_PRESET: RollSkillConfig = {
    id: 'roll',
    type: 'roll',
    duration: ROLL_DURATION,
    recovery: 0,
    cooldown: ROLL_COOLDOWN,
    iframeStart: ROLL_IFRAME_START,
    iframeEnd: ROLL_IFRAME_END,
}

/** 创建翻滚技能运行时 */
export const createRollSkillRuntime = (): RollSkillRuntime => ({
    config: ROLL_SKILL_PRESET,
    cooldownTimer: 0,
    dirX: 0,
    dirZ: 1,
})

/**
 * 翻滚自转进度（0→1，smoothstep 缓动）：世界层据此把模型根关节绕本地 X 轴旋转 2π（前滚翻）。
 * 自转与基础状态 clip 分离，与死亡倒地同模式 —— 根旋转由 world 合成，骨骼编辑器预览只含蜷缩姿态。
 * `duration` 由调用方传入（`rollSkill.config.duration`），避免与技能配置的时长隐式耦合。
 */
export const rollSpinProgress = (elapsed: number, duration: number): number => {
    const p = Math.min(Math.max(elapsed / duration, 0), 1)
    return p * p * (3 - 2 * p)
}
