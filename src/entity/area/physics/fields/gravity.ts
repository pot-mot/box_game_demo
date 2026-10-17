import {GRAVITY} from '../../../../physics/constants.ts'
import {quatVmult, type RapVector3} from '../../../../physics/rapier_utils.ts'
import type {AreaFieldContext, GravityFieldConfig} from './types.ts'

const _local: RapVector3 = {x: 0, y: 0, z: 0}
const _world: RapVector3 = {x: 0, y: 0, z: 0}
const _force: RapVector3 = {x: 0, y: 0, z: 0}

/**
 * 方向重力场：区域内重力加速度被替换为区域局部指定的加速度。
 * 由于 Rapier 的全局重力（世界 -Y）照常施加，这里只补差值 = 区域重力 − 全局重力，
 * 叠加后区域内净重力 = 区域指定重力。普通刚体走 `addForce`；角色写环境场加速度。
 */
export const applyGravity = (ctx: AreaFieldContext, cfg: GravityFieldConfig): void => {
    const {body, overlap, areaQuat, env} = ctx
    if (overlap.fraction <= 0) return
    const mass = body.mass()
    if (mass <= 0) return

    _local.x = cfg.accelX
    _local.y = cfg.accelY
    _local.z = cfg.accelZ
    quatVmult(_world, areaQuat, _local)

    /* 全局重力向量 = (0, GRAVITY, 0) */
    const dx = _world.x
    const dy = _world.y - GRAVITY
    const dz = _world.z

    if (env !== undefined) {
        env.accel.x += dx
        env.accel.y += dy
        env.accel.z += dz
        return
    }

    _force.x = dx * mass
    _force.y = dy * mass
    _force.z = dz * mass
    body.addForce(_force, true)
}
