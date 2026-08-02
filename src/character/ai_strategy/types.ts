/** 战斗子策略 */
export const COMBAT_SUB_STRATEGIES = ['tactical', 'aggressive', 'cowardly'] as const
export type CombatSubStrategy = typeof COMBAT_SUB_STRATEGIES[number]

/** 和平子策略 */
export const PEACE_SUB_STRATEGIES = ['patrol', 'build'] as const
export type PeaceSubStrategy = typeof PEACE_SUB_STRATEGIES[number]

/** 可建造的箱型列表 */
export const BUILDABLE_BOX_TYPES = ['box/common', 'box/destruction', 'box/burning', 'box/magnet', 'box/elasticity'] as const
export type BuildableBoxType = typeof BUILDABLE_BOX_TYPES[number]

/** 单个箱型的建造参数 */
export interface BoxSpawnEntry {
    entityType: BuildableBoxType
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
    /** 可破坏/燃烧箱子专用 */
    maxHealth?: number
    /** 磁力箱子专用 */
    attractionRadius?: number
    attractionStrength?: number
    /** 弹性箱子专用 */
    stiffness?: number
    dampingRatio?: number
    maxDeformFraction?: number
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

export const isBuildConfig = (cfg: PeaceConfig): cfg is BuildConfig =>
    'boxTypes' in cfg

export const isPatrolConfig = (cfg: PeaceConfig): cfg is PatrolConfig =>
    !isBuildConfig(cfg)
