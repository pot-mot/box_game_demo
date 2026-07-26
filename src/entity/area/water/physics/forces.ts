import {Vec3, Quaternion, type Body, type AABB} from 'cannon-es'
import {GRAVITY} from '../../../../physics/constants.ts'
import {DRAG_COEFFICIENT, ANGULAR_DRAG_COEFFICIENT} from './constants.ts'
import type {WaterBlockInfo} from '../types'

const tempVec = new Vec3()
const _offset = new Vec3()
const _localCorner = new Vec3()
const _qInv = new Quaternion()
const _buoyForce = new Vec3()

const applyWaterForces = (body: Body, overlapVolume: number, density: number, wbQuat: Quaternion): void => {
    if (overlapVolume <= 0 || body.mass <= 0) return
    const buoyMag = density * Math.abs(GRAVITY) * overlapVolume
    wbQuat.vmult(new Vec3(0, buoyMag, 0), _buoyForce)
    body.applyForce(_buoyForce)
    const speed = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y + body.velocity.z * body.velocity.z)
    if (speed > 0.01) {
        const dragMag = DRAG_COEFFICIENT * body.mass
        tempVec.set(-body.velocity.x * dragMag, -body.velocity.y * dragMag, -body.velocity.z * dragMag)
        body.applyForce(tempVec)
    }
    body.angularVelocity.x *= (1 - ANGULAR_DRAG_COEFFICIENT * 0.05)
    body.angularVelocity.y *= (1 - ANGULAR_DRAG_COEFFICIENT * 0.05)
    body.angularVelocity.z *= (1 - ANGULAR_DRAG_COEFFICIENT * 0.05)
}

/** 将世界坐标点转换到水体局部空间 */
const worldToLocal = (out: Vec3, world: Vec3, wbPos: Vec3, wbQuat: Quaternion): void => {
    _offset.copy(world)
    _offset.vsub(wbPos, _offset)
    wbQuat.inverse(_qInv)
    _qInv.vmult(_offset, out)
}

/** 获取刚体 AABB 与旋转水体 OBB 的重叠体积 */
const getOverlapVolume = (
    bodyAABB: AABB,
    wbPos: Vec3,
    wbQuat: Quaternion,
    hw: number, hh: number, hd: number,
): number => {
    const corners = [
        [bodyAABB.lowerBound.x, bodyAABB.lowerBound.y, bodyAABB.lowerBound.z],
        [bodyAABB.lowerBound.x, bodyAABB.lowerBound.y, bodyAABB.upperBound.z],
        [bodyAABB.lowerBound.x, bodyAABB.upperBound.y, bodyAABB.lowerBound.z],
        [bodyAABB.lowerBound.x, bodyAABB.upperBound.y, bodyAABB.upperBound.z],
        [bodyAABB.upperBound.x, bodyAABB.lowerBound.y, bodyAABB.lowerBound.z],
        [bodyAABB.upperBound.x, bodyAABB.lowerBound.y, bodyAABB.upperBound.z],
        [bodyAABB.upperBound.x, bodyAABB.upperBound.y, bodyAABB.lowerBound.z],
        [bodyAABB.upperBound.x, bodyAABB.upperBound.y, bodyAABB.upperBound.z],
    ]
    let localMinX = Infinity, localMinY = Infinity, localMinZ = Infinity
    let localMaxX = -Infinity, localMaxY = -Infinity, localMaxZ = -Infinity
    for (const [cx, cy, cz] of corners) {
        _localCorner.set(cx, cy, cz)
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

const processBody = (body: Body, wb: WaterBlockInfo): void => {
    body.updateAABB()
    const {x: wbx, y: wby, z: wbz} = wb.position
    const {x: wqx, y: wqy, z: wqz, w: wqw} = wb.quaternion
    const cfg = wb.config
    const hw = cfg.width / 2
    const hh = cfg.height / 2
    const hd = cfg.depth / 2
    const wbPos = new Vec3(wbx, wby, wbz)
    const wbQuat = new Quaternion(wqx, wqy, wqz, wqw)
    const vol = getOverlapVolume(body.aabb, wbPos, wbQuat, hw, hh, hd)
    if (vol > 0) applyWaterForces(body, vol, cfg.density, wbQuat)
}

export const setupWaterPhysics = (
    getTargetBodies: () => Body[],
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
