import {quatVmult, type RapVector3} from '../../../../physics/rapier_utils.ts'
import type {AreaFieldContext, WindFieldConfig} from './types.ts'

const _dir: RapVector3 = {x: 0, y: 0, z: 0}
const _force: RapVector3 = {x: 0, y: 0, z: 0}

/**
 * 风场：把目标流速（区域局部方向 × 速度，旋转到世界）作为刚体速度的拖拽目标。
 * 力 = drag × 质量 × (目标流速 − 当前速度) × 浸没比例。
 * 普通刚体走 `addForce`；角色写环境场（flow + flowBlend）。
 */
export const applyWind = (ctx: AreaFieldContext, cfg: WindFieldConfig): void => {
    const {body, overlap, areaQuat, env} = ctx
    if (overlap.fraction <= 0) return
    const mass = body.mass()
    if (mass <= 0) return
    const len = Math.hypot(cfg.dirX, cfg.dirY, cfg.dirZ)
    if (len < 1e-6) return

    const scale = cfg.speed / len
    _dir.x = cfg.dirX * scale
    _dir.y = cfg.dirY * scale
    _dir.z = cfg.dirZ * scale
    quatVmult(_dir, areaQuat, _dir)

    if (env !== undefined) {
        env.flow.x = _dir.x
        env.flow.y = _dir.y
        env.flow.z = _dir.z
        env.flowBlend = Math.max(env.flowBlend, cfg.drag * overlap.fraction)
        return
    }

    const lv = body.linvel()
    const k = cfg.drag * mass * overlap.fraction
    _force.x = (_dir.x - lv.x) * k
    _force.y = (_dir.y - lv.y) * k
    _force.z = (_dir.z - lv.z) * k
    body.addForce(_force, true)
}
