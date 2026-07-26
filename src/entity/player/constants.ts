import {PlayerConfigSchema} from './validation.ts'

/** 玩家默认配置 */
export const DEFAULT_PLAYER_CONFIG = PlayerConfigSchema.parse({
    speed: 6,
    jumpHeight: 2,
    radius: 0.125,
    height: 1,
})

/** 玩家碰撞组（与默认组碰撞） */
export const PLAYER_COLLISION_GROUP = 1
export const PLAYER_COLLISION_MASK = -1
