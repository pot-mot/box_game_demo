import type {BoxPresetId} from '../../types/boxPreset.ts'

/** 战斗子策略 */
export const COMBAT_SUB_STRATEGIES = ['tactical', 'aggressive', 'cowardly'] as const
export type CombatSubStrategy = typeof COMBAT_SUB_STRATEGIES[number]

/** 和平子策略 */
export const PEACE_SUB_STRATEGIES = ['patrol', 'build'] as const
export type PeaceSubStrategy = typeof PEACE_SUB_STRATEGIES[number]

/**
 * 行为原点更新策略（独立于和平 / 战斗策略的维度）：
 * - resident：恒以初始原点为准（等价无迁移）
 * - fighter：击杀瞬间取击杀者自身位置
 * - hunter：击杀瞬间取被击杀者位置
 * - roamer：以可配置间隔后的当前位置为原点（战斗期冻结、脱战后结算）
 */
export const ORIGIN_SUB_STRATEGIES = ['resident', 'fighter', 'hunter', 'roamer'] as const
export type OriginSubStrategy = typeof ORIGIN_SUB_STRATEGIES[number]

/** 原点策略配置 */
export interface OriginConfig {
    /** 漫游者原点更新间隔（秒）；其他策略为 0 不适用 */
    interval: number
}

/** 单个箱型的建造参数（特性由 preset 决定，此处仅留尺寸 / 质量 / 摩擦与概率） */
export interface BoxSpawnEntry {
    preset: BoxPresetId
    /** 被选中的概率（0~1，所有 entry 的 probability 之和应 <= 1） */
    probability: number
    minWidth: number
    maxWidth: number
    minHeight: number
    maxHeight: number
    minDepth: number
    maxDepth: number
    mass: number
    friction: number
}

/** 建造策略配置 */
export interface BuildConfig {
    buildInterval: number
    boxTypes: readonly BoxSpawnEntry[]
}

/** 巡逻策略配置 */
export interface PatrolConfig {
    patrolRadius: number
    waitTimeMin: number
    waitTimeMax: number
}

/** 和平策略配置联合类型 */
export type PeaceConfig = PatrolConfig | BuildConfig

/** 运行时校验函数 */
export const isCombatSubStrategy = (v: string): v is CombatSubStrategy =>
    (COMBAT_SUB_STRATEGIES as readonly string[]).includes(v)

export const isPeaceSubStrategy = (v: string): v is PeaceSubStrategy =>
    (PEACE_SUB_STRATEGIES as readonly string[]).includes(v)

export const isOriginSubStrategy = (v: string): v is OriginSubStrategy =>
    (ORIGIN_SUB_STRATEGIES as readonly string[]).includes(v)

export const isBuildConfig = (cfg: PeaceConfig): cfg is BuildConfig =>
    'boxTypes' in cfg

export const isPatrolConfig = (cfg: PeaceConfig): cfg is PatrolConfig =>
    !isBuildConfig(cfg)
