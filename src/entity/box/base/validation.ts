import {z} from 'zod'

/** 箱子三轴尺寸 */
export const BoxSizeSchema = z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
})

/** 刚体物理配置（尺寸 + 质量 + 摩擦） */
export const RigidBodyConfigSchema = BoxSizeSchema.extend({
    mass: z.number().min(0),
    friction: z.number().min(0),
})
