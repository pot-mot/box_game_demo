import {z} from 'zod'
import {SURFACE_MATERIAL_IDS} from '../../render/materials/ids.ts'
import {SLOPE_BLOCK_DEFAULT_MATERIAL, SLOPE_BLOCK_DEFAULT_SIZE, SLOPE_BLOCK_MAX_SIZE} from './constants.ts'

/** 斜面块配置：整数边长 + 坡向轴 + 表面材质 */
export const SlopeBlockConfigSchema = z.object({
    size: z.number().int().min(1).max(SLOPE_BLOCK_MAX_SIZE).default(SLOPE_BLOCK_DEFAULT_SIZE),
    axis: z.enum(['x', 'z']).default('x'),
    material: z.enum(SURFACE_MATERIAL_IDS).default(SLOPE_BLOCK_DEFAULT_MATERIAL),
})

export type SlopeBlockConfig = z.infer<typeof SlopeBlockConfigSchema>

export const DEFAULT_SLOPE_BLOCK_CONFIG = SlopeBlockConfigSchema.parse({})
