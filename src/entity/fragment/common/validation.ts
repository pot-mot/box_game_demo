import {z} from 'zod'
import {FRAGMENT_CONFIG_DEFAULTS} from './physics/constants.ts'

/** 碎片配置 */
export const FragmentConfigSchema = z.object({
    mass: z.number().positive().default(FRAGMENT_CONFIG_DEFAULTS.mass),
    friction: z.number().min(0).default(FRAGMENT_CONFIG_DEFAULTS.friction),
    lifetime: z.number().default(FRAGMENT_CONFIG_DEFAULTS.lifetime),
    maxLifetime: z.number().default(FRAGMENT_CONFIG_DEFAULTS.maxLifetime),
})

/** 碎片默认配置 */
export const DEFAULT_FRAGMENT_CONFIG = FragmentConfigSchema.parse({})
