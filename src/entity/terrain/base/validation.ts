import {z} from 'zod'

/** 基础地形配置 */
export const BaseTerrainConfigSchema = z.object({
    gridSize: z.number().int().positive(),
    cellSize: z.number().positive(),
    minHeight: z.number(),
    maxHeight: z.number(),
    friction: z.number().min(0),
    generatorId: z.string(),
})
