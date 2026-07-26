import {z} from 'zod'
import {RigidBodyConfigSchema} from '../base/validation.ts'

/** 磁铁箱子配置 */
export const MagnetBoxConfigSchema = RigidBodyConfigSchema.extend({
    attractionRadius: z.number().positive(),
    attractionStrength: z.number().positive(),
})
