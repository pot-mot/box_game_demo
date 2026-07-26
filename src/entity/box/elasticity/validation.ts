import {z} from 'zod'
import {RigidBodyConfigSchema} from '../base/validation.ts'

/** 弹性箱子配置 */
export const ElasticBoxConfigSchema = RigidBodyConfigSchema.extend({
    stiffness: z.number().positive(),
    dampingRatio: z.number().min(0).max(1),
    maxDeformFraction: z.number().min(0).max(1),
})
