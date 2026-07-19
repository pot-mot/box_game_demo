import type {WaterBlockConfig} from '../types'

/** 水方块默认配置 */
export const DEFAULT_WATER_CONFIG: WaterBlockConfig = {
    width: 2,
    height: 2,
    depth: 2,
    density: 2.0,
}

/** 水体密度默认值 */
export const WATER_DENSITY = 2.0
/** 线性阻尼系数 */
export const DRAG_COEFFICIENT = 4.0
/** 角阻尼系数 */
export const ANGULAR_DRAG_COEFFICIENT = 2.0
