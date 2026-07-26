import type {BaseTerrainConfig} from './base/types'

/** 默认地形配置 */
export const DEFAULT_TERRAIN_CONFIG: BaseTerrainConfig = {
    gridSize: 16,
    cellSize: 0.5,
    minHeight: 0,
    maxHeight: 2.5,
    friction: 0.3,
    generatorId: 'fbm',
}

/** 地形边缘线颜色 */
export const TERRAIN_EDGE_COLOR = 0x555555

/** 笔刷半径（格点数） */
export const BRUSH_RADIUS = 2
/** 笔刷强度（每次点击高度变化量） */
export const BRUSH_STRENGTH = 0.25
