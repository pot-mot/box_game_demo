import {GRAVITY} from '../../physics/constants.ts'
import {SLOPE_WALK_THRESHOLD} from './constants.ts'
import type {CharacterEntity} from '../types.ts'

/** 支撑面法线 Y 分量是否达到阈值（isOnGround 且足够平坦） */
export const isSupportedOn = (entity: CharacterEntity, minNy: number): boolean =>
    entity.isOnGround && entity.groundNormal.y > minNy

/** 无支撑或坡度过陡（≤ SLOPE_WALK_THRESHOLD），应进入 falling */
export const shouldFall = (entity: CharacterEntity): boolean =>
    !entity.isOnGround || entity.groundNormal.y <= SLOPE_WALK_THRESHOLD

/** 沿支撑面投影速度（v·n = 0）；无支撑或法线低于 minNy 时不投影，返回 false */
export const projectToSlope = (entity: CharacterEntity, vx: number, vz: number, minNy: number): boolean => {
    if (!isSupportedOn(entity, minNy)) return false
    const n = entity.groundNormal
    entity.body.velocity.x = vx
    entity.body.velocity.y = -(vx * n.x + vz * n.z) / n.y
    entity.body.velocity.z = vz
    return true
}

/**
 * 施加反重力完全抵消重力（合力为零），彻底防滑（仅站立时调用）：
 * cannon 每步把重力累加到 body.force 后再积分，抵消后静止角色速度保持 0、无任何位移。
 * 平地（n = (0,1,0)）同样生效；被推离支撑面后 isSupportedOn 失效，重力自动恢复。
 */
export const applySlopeAntiGravity = (entity: CharacterEntity): void => {
    if (!isSupportedOn(entity, SLOPE_WALK_THRESHOLD)) return
    entity.body.force.y = -entity.body.mass * GRAVITY
}
