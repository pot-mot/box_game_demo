import {z} from 'zod'
import {AREA_MATERIAL_IDS, DEFAULT_AREA_MATERIAL} from './constants.ts'
import {FLOAT_DEFAULTS, WIND_DEFAULTS, GRAVITY_DEFAULTS} from './physics/constants.ts'

const positive = (dflt: number): z.ZodDefault<z.ZodNumber> => z.number().positive().default(dflt)

/** 盒形区域几何 */
export const BoxShapeSchema = z.object({
    kind: z.literal('box'),
    width: positive(2),
    height: positive(2),
    depth: positive(2),
})

/** 球形区域几何 */
export const SphereShapeSchema = z.object({
    kind: z.literal('sphere'),
    radius: positive(1),
})

/** 柱形区域几何（轴向 = 局部 +Y） */
export const CylinderShapeSchema = z.object({
    kind: z.literal('cylinder'),
    radius: positive(1),
    height: positive(2),
})

/** 区域几何判别联合 */
export const AreaShapeSchema = z.discriminatedUnion('kind', [
    BoxShapeSchema,
    SphereShapeSchema,
    CylinderShapeSchema,
])

/** 浮力场配置 */
export const FloatFieldSchema = z.object({
    density: z.number().positive().default(FLOAT_DEFAULTS.density),
    drag: z.number().min(0).default(FLOAT_DEFAULTS.drag),
})

/** 风场配置（局部方向由 dirX/Y/Z 归一化得到） */
export const WindFieldSchema = z.object({
    speed: z.number().min(0).default(WIND_DEFAULTS.speed),
    dirX: z.number().default(WIND_DEFAULTS.dirX),
    dirY: z.number().default(WIND_DEFAULTS.dirY),
    dirZ: z.number().default(WIND_DEFAULTS.dirZ),
    drag: z.number().min(0).default(WIND_DEFAULTS.drag),
})

/** 方向重力场配置（局部坐标加速度） */
export const GravityFieldSchema = z.object({
    accelX: z.number().default(GRAVITY_DEFAULTS.accelX),
    accelY: z.number().default(GRAVITY_DEFAULTS.accelY),
    accelZ: z.number().default(GRAVITY_DEFAULTS.accelZ),
})

/** 默认区域几何（盒 2×2×2） */
export const DEFAULT_AREA_SHAPE = BoxShapeSchema.parse({kind: 'box'})

/**
 * 统一区域配置：几何 + 视觉材质 + 可选物理场。
 * `fields` 中存在某场对象即启用该场（可自由组合）；视觉材质与物理场解耦。
 */
export const AreaConfigSchema = z.object({
    shape: AreaShapeSchema.default(DEFAULT_AREA_SHAPE),
    material: z.enum(AREA_MATERIAL_IDS).default(DEFAULT_AREA_MATERIAL),
    fields: z.object({
        float: FloatFieldSchema.optional(),
        wind: WindFieldSchema.optional(),
        gravity: GravityFieldSchema.optional(),
    }).default({}),
})

/** 默认区域配置（新建区域：水色 + 浮力场） */
export const DEFAULT_AREA_CONFIG = AreaConfigSchema.parse({fields: {float: {}}})
