import {Vec3, type Body, type AABB} from 'cannon-es'
import {GRAVITY} from '../physics/constants.ts'
import {WATER_DENSITY, DRAG_COEFFICIENT, ANGULAR_DRAG_COEFFICIENT} from './constants.ts'
import type {WaterBlockConfig} from './types/water.ts'
import type {CommonContext} from '../common_box/types/physics.ts'
import type {DestructionContext} from '../destruction_box/types/destruction.ts'

const tempVec = new Vec3()

const applyWaterForces = (body: Body, overlapVolume: number): void => {
    if (overlapVolume <= 0 || body.mass <= 0) return

    // F = ρ · g · V_displaced  (纯向上，不传 relativePoint 避免 cannon-es 的 worldPoint × force 错误扭矩)
    const buoyMag = WATER_DENSITY * Math.abs(GRAVITY) * overlapVolume
    body.applyForce(new Vec3(0, buoyMag, 0))

    // 线性阻尼：F_drag = -k · v
    const vx = body.velocity.x
    const vy = body.velocity.y
    const vz = body.velocity.z
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
    if (speed > 0.01) {
        const dragMag = DRAG_COEFFICIENT * body.mass
        tempVec.set(-vx * dragMag, -vy * dragMag, -vz * dragMag)
        body.applyForce(tempVec)
    }

    // 角速度阻尼
    body.angularVelocity.x *= (1 - ANGULAR_DRAG_COEFFICIENT * 0.05)
    body.angularVelocity.y *= (1 - ANGULAR_DRAG_COEFFICIENT * 0.05)
    body.angularVelocity.z *= (1 - ANGULAR_DRAG_COEFFICIENT * 0.05)
}

const getOverlapVolume = (bodyAABB: AABB, wbMinX: number, wbMinY: number, wbMinZ: number, wbMaxX: number, wbMaxY: number, wbMaxZ: number): number => {
    const ox = Math.max(0, Math.min(bodyAABB.upperBound.x, wbMaxX) - Math.max(bodyAABB.lowerBound.x, wbMinX))
    const oy = Math.max(0, Math.min(bodyAABB.upperBound.y, wbMaxY) - Math.max(bodyAABB.lowerBound.y, wbMinY))
    const oz = Math.max(0, Math.min(bodyAABB.upperBound.z, wbMaxZ) - Math.max(bodyAABB.lowerBound.z, wbMinZ))
    return ox * oy * oz
}

const processBody = (body: Body, wbConfig: WaterBlockConfig, wbX: number, wbY: number, wbZ: number): void => {
    body.updateAABB()
    const hw = wbConfig.width / 2
    const hh = wbConfig.height / 2
    const hd = wbConfig.depth / 2
    const vol = getOverlapVolume(
        body.aabb,
        wbX - hw, wbY - hh, wbZ - hd,
        wbX + hw, wbY + hh, wbZ + hd,
    )
    if (vol > 0) {
        applyWaterForces(body, vol)
    }
}

export interface WaterUpdaterParams {
    common: CommonContext
    destruction: DestructionContext
    getWaterBlocks: () => {config: WaterBlockConfig; position: {x: number; y: number; z: number}}[]
}

export const setupWaterPhysics = (
    common: CommonContext,
    destruction: DestructionContext,
    getWaterBlocks: () => {config: WaterBlockConfig; position: {x: number; y: number; z: number}}[],
): () => void => {
    return () => {
        const wbs = getWaterBlocks()
        if (wbs.length === 0) return

        const commonBoxes = common.getBoxes()
        const destrBoxes = destruction.getBoxes()
        const debris = destruction.getDebris()

        for (const wb of wbs) {
            const {x: wbx, y: wby, z: wbz} = wb.position
            const cfg = wb.config

            for (const pb of commonBoxes) {
                processBody(pb.body, cfg, wbx, wby, wbz)
            }
            for (const db of destrBoxes) {
                processBody(db.body, cfg, wbx, wby, wbz)
            }
            for (const d of debris) {
                processBody(d.body, cfg, wbx, wby, wbz)
            }
        }
    }
}
