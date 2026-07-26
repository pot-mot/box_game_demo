import {CharacterConfigSchema} from './validation.ts'

export const DEFAULT_CHARACTER_CONFIG = CharacterConfigSchema.parse({
    speed: 6,
    jumpHeight: 2,
    radius: 0.125,
    height: 1,
})

export const CHARACTER_COLLISION_GROUP = 1
export const CHARACTER_COLLISION_MASK = -1
