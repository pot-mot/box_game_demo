import type {BaseTerrainConfig} from './base/types'

/** 地形碰撞组（避免与默认组 1 混淆，地形间不互碰） */
export const TERRAIN_COLLISION_GROUP = 2
/** 地形碰撞掩码（与默认组和碎片组碰撞） */
export const TERRAIN_COLLISION_MASK = 1

/** 默认地形配置 */
export const DEFAULT_TERRAIN_CONFIG: BaseTerrainConfig = {
    gridSize: 16,
    cellSize: 0.5,
    maxHeight: 2.5,
    friction: 0.3,
}

/** 地形边缘线颜色 */
export const TERRAIN_EDGE_COLOR = 0x555555

/** 笔刷半径（格点数） */
export const BRUSH_RADIUS = 2
/** 笔刷强度（每次点击高度变化量） */
export const BRUSH_STRENGTH = 0.3
