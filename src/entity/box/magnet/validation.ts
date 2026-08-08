import {z} from 'zod'
import {RigidBodyConfigSchema} from '../base/validation.ts'
import {MAGNET_CONFIG_DEFAULTS} from './physics/constants.ts'

/** 磁铁箱子配置 */
export const MagnetBoxConfigSchema = RigidBodyConfigSchema.extend({
    attractionRadius: z.number().positive().default(MAGNET_CONFIG_DEFAULTS.attractionRadius),
    attractionStrength: z.number().positive().default(MAGNET_CONFIG_DEFAULTS.attractionStrength),
})

/** 磁铁箱子默认配置 */
export const DEFAULT_MAGNET_CONFIG = MagnetBoxConfigSchema.parse({})
