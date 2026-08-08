import {z} from 'zod'
import {RigidBodyConfigSchema} from '../base/validation.ts'
import {BURNING_CONFIG_DEFAULTS} from './physics/constants.ts'

/** 燃烧箱子配置 */
export const BurningBoxConfigSchema = RigidBodyConfigSchema.extend({
    maxHealth: z.number().positive().default(BURNING_CONFIG_DEFAULTS.maxHealth),
})

/** 燃烧箱子默认配置 */
export const DEFAULT_BURNING_CONFIG = BurningBoxConfigSchema.parse({})
