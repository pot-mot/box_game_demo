import {z} from 'zod'

/** 玩家配置 */
export const PlayerConfigSchema = z.object({
    speed: z.number().positive(),
    jumpHeight: z.number().positive(),
    radius: z.number().positive(),
    height: z.number().positive(),
})

export type PlayerConfig = z.infer<typeof PlayerConfigSchema>
