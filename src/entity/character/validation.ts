import {z} from 'zod'

export const CharacterConfigSchema = z.object({
    speed: z.number().positive(),
    jumpHeight: z.number().positive(),
    radius: z.number().positive(),
    height: z.number().positive(),
})
