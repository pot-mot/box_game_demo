import {z} from 'zod'
import {RigidBodyConfigSchema} from '../base/validation.ts'
import {DESTRUCTIBLE_CONFIG_DEFAULTS} from './physics/constants.ts'

/** 可破坏箱子配置 */
export const DestructibleConfigSchema = RigidBodyConfigSchema.extend({
    maxHealth: z.number().positive().default(DESTRUCTIBLE_CONFIG_DEFAULTS.maxHealth),
})

/** 可破坏箱子默认配置 */
export const DEFAULT_DESTRUCTIBLE_CONFIG = DestructibleConfigSchema.parse({})
