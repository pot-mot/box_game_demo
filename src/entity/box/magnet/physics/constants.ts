import type {MagnetBoxConfig} from '../types'

/** 磁铁箱子默认配置 */
export const DEFAULT_MAGNET_CONFIG: MagnetBoxConfig = {
    width: 1,
    height: 1,
    depth: 1,
    mass: 1,
    friction: 0.3,
    attractionRadius: 5,
    attractionStrength: 3,
}

/** 被吸引物体的最大线速度，防止碰撞弹飞 */
export const MAX_SPEED = 8
/** 被吸引物体的最大角速度，防止疯狂旋转 */
export const MAX_SPIN = 4
