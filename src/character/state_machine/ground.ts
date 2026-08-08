import {GRAVITY} from '../../physics/constants.ts'
import {
    SLOPE_WALK_THRESHOLD,
    SLOPE_RECOVER_THRESHOLD,
    GROUND_KEEP_TIME,
    SLOPE_SINK_SPEED,
} from './constants.ts'
import type {CharacterEntity} from '../types.ts'

/** 支撑面法线 Y 分量是否达到阈值（isOnGround 且足够平坦） */
export const isSupportedOn = (entity: CharacterEntity, minNy: number): boolean =>
    entity.isOnGround && entity.groundNormal.y > minNy

/** 无支撑或坡度过陡（≤ SLOPE_WALK_THRESHOLD），应进入 falling */
export const shouldFall = (entity: CharacterEntity): boolean =>
    !entity.isOnGround || entity.groundNormal.y <= SLOPE_WALK_THRESHOLD

/**
 * 每帧维护连续悬空/支撑计时（状态机 update 开头调用）：
 * airborneTime 连续 shouldFall 时长，groundedTime 连续可恢复支撑时长。
 * 用于状态切换防抖：下坡弹跳等短暂悬空（< 阈值）不会触发 falling。
 */
export const updateGroundTimers = (entity: CharacterEntity, dt: number): void => {
    if (shouldFall(entity)) entity.airborneTime += dt
    else entity.airborneTime = 0
    if (isSupportedOn(entity, SLOPE_RECOVER_THRESHOLD)) entity.groundedTime += dt
    else entity.groundedTime = 0
}

/**
 * 宽限期内（郊狼时间中，实际已悬空）向支撑面吸附：
 * 下坡弹跳会把角色抬高，投影速度严格沿坡（v·n = 0）导致角色平行于坡面移动、永不落回。
 * 吸附速度沿支撑面法线向内，让弹跳角色快速回到坡面（接触后 groundKeepTimer 刷新，吸附自动停止）。
 */
export const applySlopeSink = (entity: CharacterEntity): void => {
    if (!isSupportedOn(entity, SLOPE_WALK_THRESHOLD)) return
    if (entity.groundKeepTimer >= GROUND_KEEP_TIME) return
    const n = entity.groundNormal
    entity.body.velocity.x -= n.x * SLOPE_SINK_SPEED
    entity.body.velocity.y -= n.y * SLOPE_SINK_SPEED
    entity.body.velocity.z -= n.z * SLOPE_SINK_SPEED
}

/** 沿支撑面投影速度（v·n = 0，保持水平速度分量）；无支撑或法线低于 minNy 时不投影，返回 false */
export const projectToSlope = (entity: CharacterEntity, vx: number, vz: number, minNy: number): boolean => {
    if (!isSupportedOn(entity, minNy)) return false
    const n = entity.groundNormal
    entity.body.velocity.x = vx
    entity.body.velocity.y = -(vx * n.x + vz * n.z) / n.y
    entity.body.velocity.z = vz
    return true
}

/**
 * 总速度固定沿坡投影（v·n = 0，速度大小 = speed，方向保留水平朝向）：
 * 陡坡（如 85°）上水平速度 6 会产生 vy ≈ 68 m/s 的爆炸速度，此函数保证总速度恒为 speed。
 * 平地（n = (0,1,0)）时退化为普通水平速度。
 */
export const projectToSlopeAtSpeed = (
    entity: CharacterEntity,
    dx: number,
    dz: number,
    speed: number,
    minNy: number,
): boolean => {
    if (!isSupportedOn(entity, minNy)) return false
    const n = entity.groundNormal
    const t = dx * n.x + dz * n.z
    const k = speed / Math.sqrt(1 + (t * t) / (n.y * n.y))
    entity.body.velocity.x = dx * k
    entity.body.velocity.y = -t * k / n.y
    entity.body.velocity.z = dz * k
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
