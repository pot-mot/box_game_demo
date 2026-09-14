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

// ── 方块人模型共享定义（entity/character/appearance 与 entity/skeleton 共用）──

/** RGB 颜色明暗缩放 */
export const darkenColor = (color: number, factor: number): number => {
    const r = Math.floor(((color >> 16) & 0xff) * factor)
    const g = Math.floor(((color >> 8) & 0xff) * factor)
    const b = Math.floor((color & 0xff) * factor)
    return (r << 16) | (g << 8) | b
}

/** RGB 颜色提亮（夹取到 255） */
export const lightenColor = (color: number, factor: number): number => {
    const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * factor))
    const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * factor))
    const b = Math.min(255, Math.floor((color & 0xff) * factor))
    return (r << 16) | (g << 8) | b
}

/** 身体部位比例（头 : 身 : 腿 ≈ 1.4 : 3.6 : 5） */
export const HEAD_RATIO = 0.14
export const BODY_RATIO = 0.36
export const LEG_RATIO = 0.5

/** 头部宽度系数（相对于 bodyW） */
export const HEAD_WIDTH_RATIO = 0.65

/** 肢体宽度系数（相对于 bodyW 即身宽） */
export const ARM_WIDTH_RATIO = 0.4
export const LEG_WIDTH_RATIO = 0.5

/** 身体前后深度系数（bodyD = bodyW * BODY_DEPTH_RATIO） */
export const BODY_DEPTH_RATIO = 0.75

/** 模型基准尺寸（scale=1 时，与碰撞箱无关） */
export const MODEL_BASE_HEIGHT = 1
export const MODEL_BASE_WIDTH = 0.25

/** 手臂X轴偏移（距离身体侧边的额外间距） */
export const ARM_X_GAP = 0.02

/** 腿部X轴偏移（距离身体中心线的间距） */
export const LEG_X_GAP = 0.04

/** 模型材质粗糙度 */
export const MODEL_ROUGHNESS = 0.6

/** 背面 / 侧面颜色暗化比例 */
export const BACK_DARKEN_RATIO = 0.55
export const SIDE_DARKEN_RATIO = 0.85

/** 面部 Canvas 纹理尺寸（像素） */
export const FACE_CANVAS_SIZE = 128

/** 髋部 pivot 基准高度（模型本地 Y）：模型原点在脚底，髋部 = 腿长，spine 重置基准 */
export const HIP_Y = MODEL_BASE_HEIGHT * LEG_RATIO
