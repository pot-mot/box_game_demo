import {CommonBoxConfigSchema} from '../validation.ts'

/** 普通箱子默认配置 */
export const DEFAULT_COMMON_CONFIG = CommonBoxConfigSchema.parse({
    width: 1,
    height: 1,
    depth: 1,
    mass: 1,
    friction: 0.3,
})
