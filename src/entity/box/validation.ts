import {z} from 'zod'
import {RigidBodyConfigSchema} from './base/validation.ts'
import {SURFACE_MATERIAL_IDS} from '../../render/materials/ids.ts'
import {DEFAULT_BOX_MATERIAL} from './constants.ts'
import {
    DESTRUCTIBLE_DEFAULTS,
    BURNING_DEFAULTS,
    MAGNET_DEFAULTS,
    ELASTIC_DEFAULTS,
    FRAGMENT_COUNT_MIN,
    FRAGMENT_COUNT_MAX,
} from './physics/constants.ts'

/** 可破坏特性配置 */
export const DestructibleTraitSchema = z.object({
    maxHealth: z.number().positive().default(DESTRUCTIBLE_DEFAULTS.maxHealth),
    /** 碎裂目标块数（实际块数受几何退格影响，可能略少） */
    fragmentCount: z.number().int().min(FRAGMENT_COUNT_MIN).max(FRAGMENT_COUNT_MAX).default(DESTRUCTIBLE_DEFAULTS.fragmentCount),
})

/** 燃烧特性配置 */
export const BurningTraitSchema = z.object({
    maxHealth: z.number().positive().default(BURNING_DEFAULTS.maxHealth),
})

/** 磁力特性配置 */
export const MagnetTraitSchema = z.object({
    attractionRadius: z.number().positive().default(MAGNET_DEFAULTS.attractionRadius),
    attractionStrength: z.number().positive().default(MAGNET_DEFAULTS.attractionStrength),
})

/** 弹性特性配置 */
export const ElasticTraitSchema = z.object({
    stiffness: z.number().positive().default(ELASTIC_DEFAULTS.stiffness),
    dampingRatio: z.number().min(0).max(1).default(ELASTIC_DEFAULTS.dampingRatio),
    maxDeformFraction: z.number().min(0).max(1).default(ELASTIC_DEFAULTS.maxDeformFraction),
})

/**
 * 统一箱子配置：刚体物理（尺寸 / 质量 / 摩擦）+ 表面材质 + 可选特性。
 * 配置中存在某一特性对象即启用该特性（各特性可自由组合、各自独立生命值）。
 */
export const BoxConfigSchema = RigidBodyConfigSchema.extend({
    material: z.enum(SURFACE_MATERIAL_IDS).default(DEFAULT_BOX_MATERIAL),
    destructible: DestructibleTraitSchema.optional(),
    burning: BurningTraitSchema.optional(),
    magnet: MagnetTraitSchema.optional(),
    elastic: ElasticTraitSchema.optional(),
})

/** 默认箱子配置（无特性） */
export const DEFAULT_BOX_CONFIG = BoxConfigSchema.parse({})
