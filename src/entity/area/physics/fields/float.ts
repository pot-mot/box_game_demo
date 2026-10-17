import {GRAVITY} from '../../../../physics/constants.ts'
import {quatVmult, v3Length, type RapVector3} from '../../../../physics/rapier_utils.ts'
import {FLOAT_ANGULAR_DRAG_COEFFICIENT} from '../constants.ts'
import type {AreaFieldContext, FloatFieldConfig} from './types.ts'

const _buoyForce: RapVector3 = {x: 0, y: 0, z: 0}
const _drag: RapVector3 = {x: 0, y: 0, z: 0}
const _localUp: RapVector3 = {x: 0, y: 1, z: 0}

/**
 * 浮力场：沿区域局部 +Y 的浮力（= 密度 × |g| × 浸没体积）+ 线性 / 角阻尼。
 * 普通刚体走 `addForce`；角色写环境场（浮力加速度 + 流速归零的拖拽），
 * 由角色物理在状态机之后消费，避免被水平速度覆写抹掉。
 */
export const applyFloat = (ctx: AreaFieldContext, cfg: FloatFieldConfig): void => {
    const {body, overlap, areaQuat, env} = ctx
    if (overlap.volume <= 0) return
    const mass = body.mass()
    if (mass <= 0) return

    const buoyMag = cfg.density * Math.abs(GRAVITY) * overlap.volume
    quatVmult(_buoyForce, areaQuat, _localUp)
    _buoyForce.x *= buoyMag
    _buoyForce.y *= buoyMag
    _buoyForce.z *= buoyMag

    if (env !== undefined) {
        env.accel.x += _buoyForce.x / mass
        env.accel.y += _buoyForce.y / mass
        env.accel.z += _buoyForce.z / mass
        /* 拖拽：目标流速保持（风场可能已写入），仅提高向目标混合的速率 */
        env.flowBlend = Math.max(env.flowBlend, cfg.drag)
        env.fluidFraction = Math.max(env.fluidFraction, overlap.fraction)
        return
    }

    body.addForce(_buoyForce, true)
    const lv = body.linvel()
    if (v3Length(lv) > 0.01) {
        const dragMag = cfg.drag * mass
        _drag.x = -lv.x * dragMag
        _drag.y = -lv.y * dragMag
        _drag.z = -lv.z * dragMag
        body.addForce(_drag, true)
    }
    const av = body.angvel()
    const keep = 1 - FLOAT_ANGULAR_DRAG_COEFFICIENT * 0.05
    body.setAngvel({x: av.x * keep, y: av.y * keep, z: av.z * keep}, true)
}
