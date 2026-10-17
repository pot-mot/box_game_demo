import type {OriginSubStrategy, OriginConfig} from './types.ts'

export type {OriginSubStrategy, OriginConfig}

/** 漫游者默认原点更新间隔（秒） */
export const DEFAULT_ROAMER_INTERVAL = 20

/** 各原点子策略默认配置 */
export const DEFAULT_ORIGIN_CONFIGS: Record<OriginSubStrategy, OriginConfig> = {
    resident: {interval: 0},
    fighter: {interval: 0},
    hunter: {interval: 0},
    roamer: {interval: DEFAULT_ROAMER_INTERVAL},
}
