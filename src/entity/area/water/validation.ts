import {z} from 'zod'
import {WATER_CONFIG_DEFAULTS} from './physics/constants.ts'

/** 水体方块配置 */
export const WaterBlockConfigSchema = z.object({
    width: z.number().positive().default(WATER_CONFIG_DEFAULTS.width),
    height: z.number().positive().default(WATER_CONFIG_DEFAULTS.height),
    depth: z.number().positive().default(WATER_CONFIG_DEFAULTS.depth),
    density: z.number().positive().default(WATER_CONFIG_DEFAULTS.density),
})

/** 水体方块默认配置 */
export const DEFAULT_WATER_CONFIG = WaterBlockConfigSchema.parse({})
