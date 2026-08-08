import {z} from 'zod'

/** 箱子尺寸默认值（供 schema .default() 引用） */
export const BOX_SIZE_DEFAULTS = {
    width: 1,
    height: 1,
    depth: 1,
}

/** 刚体配置默认值 */
export const RIGID_BODY_DEFAULTS = {
    ...BOX_SIZE_DEFAULTS,
    mass: 1,
    friction: 0.3,
}

/** 箱子三轴尺寸 */
export const BoxSizeSchema = z.object({
    width: z.number().positive().default(BOX_SIZE_DEFAULTS.width),
    height: z.number().positive().default(BOX_SIZE_DEFAULTS.height),
    depth: z.number().positive().default(BOX_SIZE_DEFAULTS.depth),
})

/** 刚体物理配置（尺寸 + 质量 + 摩擦） */
export const RigidBodyConfigSchema = BoxSizeSchema.extend({
    mass: z.number().min(0).default(RIGID_BODY_DEFAULTS.mass),
    friction: z.number().min(0).default(RIGID_BODY_DEFAULTS.friction),
})
