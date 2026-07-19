import type {WaterBlockConfig} from '../types'

/** 水方块默认尺寸配置 */
export const DEFAULT_WATER_CONFIG: WaterBlockConfig = {
    width: 2,
    height: 2,
    depth: 2,
}

/** 水体密度 */
export const WATER_DENSITY = 2.0
/** 线性阻尼系数 */
export const DRAG_COEFFICIENT = 4.0
/** 角阻尼系数 */
export const ANGULAR_DRAG_COEFFICIENT = 2.0
