/** 体素 block 边长（世界单位） */
export const VOXEL_SIZE = 1
/** chunk 各轴体素数量（体素以边长为单位对齐，chunk 为立方体） */
export const CHUNK_SIZE = 16
/** 单个 chunk 的体素总数 */
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE
/** 全细节渲染距离（chunk 数）：此范围内构建逐体素贪心网格 */
export const RENDER_CHUNK_RADIUS = 6
/** 粗 LOD 渲染距离（chunk 数）：全细节之外、此范围内构建降采样合并网格 */
export const LOD_CHUNK_RADIUS = 14
/** LOD 降采样步长（体素）：每 stride³ 个体素聚合为一个粗格（须整除 CHUNK_SIZE） */
export const LOD_STRIDE = 4
/** 细节层滞回（chunk 数）：避免相机在细节 / LOD 边界反复切换 */
export const LOD_DETAIL_HYSTERESIS_CHUNKS = 1
/** 卸载滞回（chunk 数）：超出 LOD 半径后保留的范围，避免边界反复加载 / 卸载 */
export const UNLOAD_HYSTERESIS_CHUNKS = 2
/** 物理距离（chunk 数）：仅此范围内的 chunk 生成合并 trimesh collider */
export const PHYSICS_CHUNK_RADIUS = 2
/** 每帧最多构建的 chunk 网格数（摊还，避免卡顿尖峰） */
export const MAX_CHUNK_MESH_BUILDS_PER_FRAME = 4
/** 每帧最多构建的 chunk 碰撞体数 */
export const MAX_CHUNK_COLLIDER_BUILDS_PER_FRAME = 2
/** 建筑默认配置 */
export const BUILDING_CONFIG_DEFAULTS = {
    recipe: 'house',
    seed: 1,
    sizeX: 8,
    sizeY: 5,
    sizeZ: 8,
}
/** 建筑生成器允许的最大单轴尺寸（防止误操作生成超大网格） */
export const BUILDING_MAX_AXIS_SIZE = 64
/** 建造笔刷：按下 / 抬起超过此像素视为拖拽（旋转视角）而非点击放置 */
export const BRUSH_CLICK_THRESHOLD = 5
/** 区域填充单次操作的体素上限（防止误操作生成超大网格） */
export const MAX_FILL_BLOCKS = 65536
