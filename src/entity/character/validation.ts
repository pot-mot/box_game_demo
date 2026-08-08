import {z} from 'zod'
import {CHARACTER_CONFIG_DEFAULTS} from './constants.ts'

export const CharacterConfigSchema = z.object({
    speed: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.speed),
    jumpHeight: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.jumpHeight),
    scale: z.number().positive().default(CHARACTER_CONFIG_DEFAULTS.scale),
})

/** 角色默认配置 */
export const DEFAULT_CHARACTER_CONFIG = CharacterConfigSchema.parse({})
