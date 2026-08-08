/** 基础地形配置默认值（供 schema .default() 引用） */
export const TERRAIN_CONFIG_DEFAULTS = {
    gridSize: 16,
    cellSize: 1,
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
