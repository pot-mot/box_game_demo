import {z} from 'zod'
import {RigidBodyConfigSchema} from '../base/validation.ts'

/** 可破坏箱子配置 */
export const DestructibleConfigSchema = RigidBodyConfigSchema.extend({
    maxHealth: z.number().positive(),
})
