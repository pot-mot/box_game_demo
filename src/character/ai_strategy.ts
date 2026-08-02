/** AI 策略类型 */
export const AI_STRATEGY_VALUES = ['tactical', 'aggressive', 'cowardly'] as const
export type AIStrategy = typeof AI_STRATEGY_VALUES[number]

/** 运行时校验 AI 策略字符串是否为合法值 */
export const isAIStrategy = (v: string): v is AIStrategy =>
    (AI_STRATEGY_VALUES as readonly string[]).includes(v)

/** 各策略下的时间上限常量（单位：秒，0 表示不限制） */
export interface AIStrategyConfig {
    /** 追逐超时后放弃追击回到 patrol */
    chaseTimeout: number
    /** 逼近超时后重新评估 */
    approachTimeout: number
    /** 扫射超时后变招 */
    volleyTimeout: number
    /** 后退超时后尝试还击 */
    kiteTimeout: number
    /** 攻击超时后调整位置 */
    attackTimeout: number
    /** 逃跑持续时间（cowardly 专用） */
    fleeDuration: number
    /** 短暂还击次数上限（cowardly 专用） */
    attackBurstCount: number
}

/** 各策略默认配置 */
export const DEFAULT_STRATEGY_CONFIGS: Record<AIStrategy, AIStrategyConfig> = {
    tactical: {
        chaseTimeout: 5,
        approachTimeout: 4,
        volleyTimeout: 8,
        kiteTimeout: 3,
        attackTimeout: 3,
        fleeDuration: 0,
        attackBurstCount: 0,
    },
    aggressive: {
        chaseTimeout: 0,    // 永不放弃
        approachTimeout: 0,
        volleyTimeout: 4,
        kiteTimeout: 1.5,
        attackTimeout: 4,
        fleeDuration: 0,
        attackBurstCount: 0,
    },
    cowardly: {
        chaseTimeout: 1.5,
        approachTimeout: 1,
        volleyTimeout: 1.5,
        kiteTimeout: 1,
        attackTimeout: 1.5,
        fleeDuration: 2.5,
        attackBurstCount: 2,
    },
}
