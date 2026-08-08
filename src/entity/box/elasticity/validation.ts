import {z} from 'zod'
import {RigidBodyConfigSchema} from '../base/validation.ts'
import {ELASTIC_CONFIG_DEFAULTS} from './physics/constants.ts'

/** 弹性箱子配置 */
export const ElasticBoxConfigSchema = RigidBodyConfigSchema.extend({
    stiffness: z.number().positive().default(ELASTIC_CONFIG_DEFAULTS.stiffness),
    dampingRatio: z.number().min(0).max(1).default(ELASTIC_CONFIG_DEFAULTS.dampingRatio),
    maxDeformFraction: z.number().min(0).max(1).default(ELASTIC_CONFIG_DEFAULTS.maxDeformFraction),
})

/** 弹性箱子默认配置 */
export const DEFAULT_ELASTIC_CONFIG = ElasticBoxConfigSchema.parse({})
