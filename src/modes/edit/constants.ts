/** WASD 每帧移动步长 */
export const MOVE_STEP = 0.04
/** 右键生成箱子时与相机的距离 */
export const SPAWN_DIST = 4
/** 指针按下/抬起超过此像素视为拖拽而非点击 */
export const CLICK_THRESHOLD = 5
/** 地形雕刻笔刷半径（格点数） */
export const BRUSH_RADIUS = 2
/** 地形雕刻笔刷强度（每次点击高度变化量） */
export const BRUSH_STRENGTH = 0.3
/** 变换 Gizmo 缩放系数（根据相机距离调整视觉大小；实体尺寸较大，系数高于骨骼编辑模式的 0.12） */
export const GIZMO_SCALE_FACTOR = 0.15
