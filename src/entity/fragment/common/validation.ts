import {z} from 'zod'
import {SURFACE_MATERIAL_IDS, DEFAULT_SURFACE_MATERIAL} from '../../../render/materials/ids.ts'
import {FRAGMENT_CONFIG_DEFAULTS} from './physics/constants.ts'

/** 碎片配置 */
export const FragmentConfigSchema = z.object({
    mass: z.number().positive().default(FRAGMENT_CONFIG_DEFAULTS.mass),
    friction: z.number().min(0).default(FRAGMENT_CONFIG_DEFAULTS.friction),
    lifetime: z.number().default(FRAGMENT_CONFIG_DEFAULTS.lifetime),
    maxLifetime: z.number().default(FRAGMENT_CONFIG_DEFAULTS.maxLifetime),
    /** 表面材质（沿用裂开前箱子的材质；旧档缺失安全回退默认） */
    material: z.enum(SURFACE_MATERIAL_IDS).default(DEFAULT_SURFACE_MATERIAL),
})

/** 碎片默认配置 */
export const DEFAULT_FRAGMENT_CONFIG = FragmentConfigSchema.parse({})
