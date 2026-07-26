import {z} from 'zod'

/** 水体方块配置 */
export const WaterBlockConfigSchema = z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
    density: z.number().positive(),
})
