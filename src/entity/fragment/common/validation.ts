import {z} from 'zod'

/** 碎片配置 */
export const FragmentConfigSchema = z.object({
    mass: z.number().positive(),
    friction: z.number().min(0),
    lifetime: z.number(),
    maxLifetime: z.number(),
})
