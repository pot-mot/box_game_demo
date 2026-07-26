import {BurningBoxConfigSchema} from '../validation.ts'

export const DEFAULT_BURNING_CONFIG = BurningBoxConfigSchema.parse({
    width: 1,
    height: 1,
    depth: 1,
    mass: 1,
    friction: 0.3,
    maxHealth: 10,
})
