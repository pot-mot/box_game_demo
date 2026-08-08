import {z} from 'zod'
import {TERRAIN_CONFIG_DEFAULTS} from '../constants.ts'

/** 基础地形配置 */
export const BaseTerrainConfigSchema = z.object({
    gridSize: z.number().int().positive().default(TERRAIN_CONFIG_DEFAULTS.gridSize),
    cellSize: z.number().positive().default(TERRAIN_CONFIG_DEFAULTS.cellSize),
    minHeight: z.number().default(TERRAIN_CONFIG_DEFAULTS.minHeight),
    maxHeight: z.number().default(TERRAIN_CONFIG_DEFAULTS.maxHeight),
    friction: z.number().min(0).default(TERRAIN_CONFIG_DEFAULTS.friction),
    generatorId: z.string().default(TERRAIN_CONFIG_DEFAULTS.generatorId),
})

/** 默认地形配置 */
export const DEFAULT_TERRAIN_CONFIG = BaseTerrainConfigSchema.parse({})
