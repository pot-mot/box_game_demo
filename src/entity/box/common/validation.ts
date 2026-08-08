import {RigidBodyConfigSchema} from '../base/validation.ts'

/** 普通箱子配置（与刚体配置完全一致） */
export const CommonBoxConfigSchema = RigidBodyConfigSchema

/** 普通箱子默认配置 */
export const DEFAULT_COMMON_CONFIG = CommonBoxConfigSchema.parse({})
