/** 相机视场角 */
export const FOV = 75
/** 相机近裁面 */
export const NEAR = 0.1
/** 相机远裁面 */
export const FAR = 1000
/** 相机初始 Y 高度 */
export const CAMERA_Y = 2

/** 纹理画布尺寸 */
export const TEX_SIZE = 256
/** 纹理网格划分数量（每 TILE_SIZE 世界单位 1 格） */
export const TEX_DIV = 1
/** 纹理平铺单位大小（世界单位） */
export const TILE_SIZE = 0.5
/** 默认网格底色 */
export const DEFAULT_BASE_COLOR = 0x777777
/** 默认网格线颜色 */
export const DEFAULT_GRID_COLOR = 0x999999

/** 无限网格单元尺寸 */
export const GRID_CELL_SIZE = 1
/** 无限网格有效渲染半径（超出此距离完全透明） */
export const GRID_RADIUS = 64
/** PlaneGeometry 边长（= 2 × GRID_RADIUS） */
export const GRID_PLANE_SIZE = GRID_RADIUS * 2
/** 普通网格线半宽度（世界单位） */
export const GRID_LINE_HALF_WIDTH = 0.02
/** 普通网格线颜色 */
export const GRID_COLOR = 0xbbbbbb
/** 中心轴线颜色 */
export const GRID_CENTER_COLOR = 0xcccccc
/** 中心轴线宽度倍率（相对于普通网格线） */
export const GRID_CENTER_MULTIPLIER = 1.5
