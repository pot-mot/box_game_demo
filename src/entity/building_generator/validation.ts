import {z} from 'zod'
import {BUILDING_CONFIG_DEFAULTS, BUILDING_MAX_AXIS_SIZE} from './constants.ts'

/** 建筑生成配置：配方 + 随机种子 + 包围尺寸（体素数） */
export const BuildingConfigSchema = z.object({
    recipe: z.string().default(BUILDING_CONFIG_DEFAULTS.recipe),
    seed: z.number().int().default(BUILDING_CONFIG_DEFAULTS.seed),
    sizeX: z.number().int().min(1).max(BUILDING_MAX_AXIS_SIZE).default(BUILDING_CONFIG_DEFAULTS.sizeX),
    sizeY: z.number().int().min(1).max(BUILDING_MAX_AXIS_SIZE).default(BUILDING_CONFIG_DEFAULTS.sizeY),
    sizeZ: z.number().int().min(1).max(BUILDING_MAX_AXIS_SIZE).default(BUILDING_CONFIG_DEFAULTS.sizeZ),
})

/** 建筑生成配置类型 */
export type BuildingConfig = z.infer<typeof BuildingConfigSchema>

/** 建筑默认配置 */
export const DEFAULT_BUILDING_CONFIG = BuildingConfigSchema.parse({})
