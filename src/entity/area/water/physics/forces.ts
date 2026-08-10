import {v3Set, v3Length, v3Sub, quatVmult, type RapVector3, type RapQuaternion} from '../../../../physics/rapier_utils.ts'
import RAPIER from '@dimforge/rapier3d-compat'
import {GRAVITY} from '../../../../physics/constants.ts'
import {DRAG_COEFFICIENT, ANGULAR_DRAG_COEFFICIENT} from './constants.ts'
import type {WaterBlockInfo} from '../types'

const _tmp: RapVector3 = {x: 0, y: 0, z: 0}
const _offset: RapVector3 = {x: 0, y: 0, z: 0}
const _localCorner: RapVector3 = {x: 0, y: 0, z: 0}
const _buoyForce: RapVector3 = {x: 0, y: 0, z: 0}

const applyWaterForces = (body: RAPIER.RigidBody, overlapVolume: number, density: number, wbQuat: RapQuaternion): void => {
    if (overlapVolume <= 0 || body.mass() <= 0) return
    const buoyMag = density * Math.abs(GRAVITY) * overlapVolume
    quatVmult(_buoyForce, wbQuat, {x: 0, y: buoyMag, z: 0})
    body.addForce(_buoyForce, true)
    const lv = body.linvel()
    const speed = v3Length(lv)
    if (speed > 0.01) {
        const dragMag = DRAG_COEFFICIENT * body.mass()
        _tmp.x = -lv.x * dragMag
        _tmp.y = -lv.y * dragMag
        _tmp.z = -lv.z * dragMag
        body.addForce(_tmp, true)
    }
    const av = body.angvel()
    body.setAngvel(
        {
            x: av.x * (1 - ANGULAR_DRAG_COEFFICIENT * 0.05),
            y: av.y * (1 - ANGULAR_DRAG_COEFFICIENT * 0.05),
            z: av.z * (1 - ANGULAR_DRAG_COEFFICIENT * 0.05),
        },
        true,
    )
}

/** 将世界坐标点转换到水体局部空间 */
const worldToLocal = (out: RapVector3, world: RapVector3, wbPos: RapVector3, wbQuat: RapQuaternion): void => {
    v3Sub(_offset, world, wbPos)
    const invQuat: RapQuaternion = {x: -wbQuat.x, y: -wbQuat.y, z: -wbQuat.z, w: wbQuat.w}
    quatVmult(out, invQuat, _offset)
}

/** 获取刚体 AABB 与旋转水体 OBB 的重叠体积 */
const getOverlapVolume = (
    body: RAPIER.RigidBody,
    wbPos: RapVector3,
    wbQuat: RapQuaternion,
    hw: number, hh: number, hd: number,
): number => {
    const collider = body.collider(0)
    if (!collider) return 0
    const pos = body.translation()
    const halfExt = { x: 0.5, y: 0.5, z: 0.5 }
    const worldAabb = {
        mins: { x: pos.x - halfExt.x, y: pos.y - halfExt.y, z: pos.z - halfExt.z },
        maxs: { x: pos.x + halfExt.x, y: pos.y + halfExt.y, z: pos.z + halfExt.z },
    }
    const corners = [
        [worldAabb.mins.x, worldAabb.mins.y, worldAabb.mins.z],
        [worldAabb.mins.x, worldAabb.mins.y, worldAabb.maxs.z],
        [worldAabb.mins.x, worldAabb.maxs.y, worldAabb.mins.z],
        [worldAabb.mins.x, worldAabb.maxs.y, worldAabb.maxs.z],
        [worldAabb.maxs.x, worldAabb.mins.y, worldAabb.mins.z],
        [worldAabb.maxs.x, worldAabb.mins.y, worldAabb.maxs.z],
        [worldAabb.maxs.x, worldAabb.maxs.y, worldAabb.mins.z],
        [worldAabb.maxs.x, worldAabb.maxs.y, worldAabb.maxs.z],
    ]
    let localMinX = Infinity, localMinY = Infinity, localMinZ = Infinity
    let localMaxX = -Infinity, localMaxY = -Infinity, localMaxZ = -Infinity
    for (const [cx, cy, cz] of corners) {
        v3Set(_localCorner, cx, cy, cz)
        worldToLocal(_localCorner, _localCorner, wbPos, wbQuat)
        if (_localCorner.x < localMinX) localMinX = _localCorner.x
        if (_localCorner.y < localMinY) localMinY = _localCorner.y
        if (_localCorner.z < localMinZ) localMinZ = _localCorner.z
        if (_localCorner.x > localMaxX) localMaxX = _localCorner.x
        if (_localCorner.y > localMaxY) localMaxY = _localCorner.y
        if (_localCorner.z > localMaxZ) localMaxZ = _localCorner.z
    }
    const ox = Math.max(0, Math.min(localMaxX, hw) - Math.max(localMinX, -hw))
    const oy = Math.max(0, Math.min(localMaxY, hh) - Math.max(localMinY, -hh))
    const oz = Math.max(0, Math.min(localMaxZ, hd) - Math.max(localMinZ, -hd))
    return ox * oy * oz
}

const processBody = (body: RAPIER.RigidBody, wb: WaterBlockInfo): void => {
    const {x: wbx, y: wby, z: wbz} = wb.position
    const {x: wqx, y: wqy, z: wqz, w: wqw} = wb.quaternion
    const cfg = wb.config
    const hw = cfg.width / 2
    const hh = cfg.height / 2
    const hd = cfg.depth / 2
    const wbPos: RapVector3 = {x: wbx, y: wby, z: wbz}
    const wbQuat: RapQuaternion = {x: wqx, y: wqy, z: wqz, w: wqw}
    const vol = getOverlapVolume(body, wbPos, wbQuat, hw, hh, hd)
    if (vol > 0) applyWaterForces(body, vol, cfg.density, wbQuat)
}

export const setupWaterPhysics = (
    getTargetBodies: () => RAPIER.RigidBody[],
    getWaterBlocks: () => WaterBlockInfo[],
): () => void => {
    return () => {
        const wbs = getWaterBlocks()
        if (wbs.length === 0) return
        const bodies = getTargetBodies()
        for (const wb of wbs) {
            for (const body of bodies) {
                processBody(body, wb)
            }
        }
    }
}
