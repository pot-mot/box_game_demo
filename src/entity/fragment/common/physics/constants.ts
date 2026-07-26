import {FragmentConfigSchema} from '../validation.ts'

/** 碎片默认配置 */
export const DEFAULT_FRAGMENT_CONFIG = FragmentConfigSchema.parse({
    mass: 0.5,
    friction: 0.3,
    lifetime: 5,
    maxLifetime: 5,
})
