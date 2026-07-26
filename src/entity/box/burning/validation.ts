import {z} from 'zod'
import {RigidBodyConfigSchema} from '../base/validation.ts'

/** 燃烧箱子配置 */
export const BurningBoxConfigSchema = RigidBodyConfigSchema.extend({
    maxHealth: z.number().positive(),
})
