import {WaterBlockConfigSchema} from '../validation.ts'

export const DEFAULT_WATER_CONFIG = WaterBlockConfigSchema.parse({
    width: 2,
    height: 2,
    depth: 2,
    density: 2.0,
})

export const WATER_DENSITY = 2.0
export const DRAG_COEFFICIENT = 4.0
export const ANGULAR_DRAG_COEFFICIENT = 2.0
