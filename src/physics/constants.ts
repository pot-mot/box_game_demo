/** 重力加速度（Y 轴向下） */
export const GRAVITY = -9.82
/** 物理固定时间步长 */
export const FIXED_TIME_STEP = 1 / 60
/** 每帧最大物理子步数 */
export const MAX_SUB_STEPS = 3
/** 帧间隔上限，防止卡顿时 delta 过大导致物理爆炸 */
export const MAX_DT = 0.033
/** 地面 Y 坐标 */
export const GROUND_Y = 0
/** 箱子之间的摩擦系数 */
export const BOX_BOX_FRICTION = 0.5
/** 箱子与地面的摩擦系数 */
export const BOX_GROUND_FRICTION = 0.3

// --- 碰撞组 ---
// cannon-es 用 bitmask 做碰撞过滤，broadphase 的 needBroadphaseCollision 检查：
//   (groupA & maskB) !== 0 && (groupB & maskA) !== 0 时才产生碰撞对。
// 组 1   — 场景默认组（地面、common_box、destruction_box）
// 组 2   — 碎片（只与组 1 碰撞，碎片间不互撞）
/** 场景默认 Body 的 collisionFilterGroup */
export const DEFAULT_COLLISION_GROUP = 1
/** 场景默认 Body 的 collisionFilterMask（与所有组碰撞） */
export const DEFAULT_COLLISION_MASK = -1
/** 碎片 Body 的 collisionFilterGroup */
export const DEBRIS_COLLISION_GROUP = 1
/** 碎片 Body 的 collisionFilterMask */
export const DEBRIS_COLLISION_MASK = 1
