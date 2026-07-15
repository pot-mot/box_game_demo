/** 相机视场角 */
export const FOV = 75
/** 相机近裁面 */
export const NEAR = 0.1
/** 相机远裁面 */
export const FAR = 1000
/** 相机初始 Y 高度 */
export const CAMERA_Y = 2

/** 箱子边缘线颜色 */
export const EDGE_COLOR = 0x333333
/** 选中线框颜色 */
export const SELECTED_EDGE_COLOR = 0x00ffcc

/** 纹理画布尺寸 */
export const TEX_SIZE = 256
/** 纹理网格划分数量 */
export const TEX_DIV = 4
/** 纹理底色 */
export const TEX_FILL = '#777777'
/** 纹理网格线颜色 */
export const TEX_GRID = '#999999'
/** 纹理边框色 */
export const TEX_ACCENT = '#bbbbbb'

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
