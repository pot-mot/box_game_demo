import {Vec3, type Body, type AABB} from 'cannon-es'
import {GRAVITY} from '../../../../physics/constants.ts'
import {DRAG_COEFFICIENT, ANGULAR_DRAG_COEFFICIENT} from './constants.ts'
import type {WaterBlockInfo} from '../types'

const tempVec = new Vec3()

const applyWaterForces = (body: Body, overlapVolume: number, density: number): void => {
    if (overlapVolume <= 0 || body.mass <= 0) return
    const buoyMag = density * Math.abs(GRAVITY) * overlapVolume
    body.applyForce(new Vec3(0, buoyMag, 0))
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

const getOverlapVolume = (
    bodyAABB: AABB,
    wbMinX: number, wbMinY: number, wbMinZ: number,
    wbMaxX: number, wbMaxY: number, wbMaxZ: number,
): number => {
    const ox = Math.max(0, Math.min(bodyAABB.upperBound.x, wbMaxX) - Math.max(bodyAABB.lowerBound.x, wbMinX))
    const oy = Math.max(0, Math.min(bodyAABB.upperBound.y, wbMaxY) - Math.max(bodyAABB.lowerBound.y, wbMinY))
    const oz = Math.max(0, Math.min(bodyAABB.upperBound.z, wbMaxZ) - Math.max(bodyAABB.lowerBound.z, wbMinZ))
    return ox * oy * oz
}

const processBody = (body: Body, wbConfig: WaterBlockInfo['config'], wbX: number, wbY: number, wbZ: number): void => {
    body.updateAABB()
    const hw = wbConfig.width / 2
    const hh = wbConfig.height / 2
    const hd = wbConfig.depth / 2
    const vol = getOverlapVolume(
        body.aabb,
        wbX - hw, wbY - hh, wbZ - hd,
        wbX + hw, wbY + hh, wbZ + hd,
    )
    if (vol > 0) applyWaterForces(body, vol, wbConfig.density)
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
            const {x: wbx, y: wby, z: wbz} = wb.position
            const cfg = wb.config
            for (const body of bodies) {
                processBody(body, cfg, wbx, wby, wbz)
            }
        }
    }
}
