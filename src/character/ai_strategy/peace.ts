import type {PeaceSubStrategy, PeaceConfig} from './types.ts'

export type {PeaceSubStrategy, PeaceConfig}

/** 各和平子策略默认配置 */
export const DEFAULT_PEACE_CONFIGS: Record<PeaceSubStrategy, PeaceConfig> = {
    patrol: {
        patrolRadius: 5,
        waitTimeMin: 0.5,
        waitTimeMax: 2.5,
    },
    build: {
        buildInterval: 3,
        boxTypes: [
            {
                entityType: 'box/common',
                probability: 1,
                minWidth: 0.5, maxWidth: 2,
                minHeight: 0.5, maxHeight: 2,
                minDepth: 0.5, maxDepth: 2,
                mass: 1, friction: 0.3,
            },
        ],
    },
}
