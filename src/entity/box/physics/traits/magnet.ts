import RAPIER from '@dimforge/rapier3d-compat'
import {MAGNET_MAX_SPEED} from '../constants.ts'

const _force = {x: 0, y: 0, z: 0}

/**
 * 对范围内的动态刚体施加指向磁力点的力（同时清零角速度、钳制线速度上限）。
 * `excludeHandles` 为全部磁力箱自身刚体句柄，避免互相吸引。
 */
export const applyMagnetAttraction = (
    origin: {x: number; y: number; z: number},
    radius: number,
    strength: number,
    targets: Iterable<RAPIER.RigidBody>,
    excludeHandles: ReadonlySet<number>,
): void => {
    if (radius <= 0 || strength <= 0) return
    const radiusSq = radius * radius

    for (const target of targets) {
        if (excludeHandles.has(target.handle)) continue
        if (target.bodyType() === RAPIER.RigidBodyType.Fixed) continue

        const tPos = target.translation()
        const dx = origin.x - tPos.x
        const dy = origin.y - tPos.y
        const dz = origin.z - tPos.z
        const distSq = dx * dx + dy * dy + dz * dz

        if (distSq <= 0 || distSq >= radiusSq) continue

        target.setAngvel({x: 0, y: 0, z: 0}, true)

        const v = target.linvel()
        const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
        if (speed > MAGNET_MAX_SPEED) {
            const scale = MAGNET_MAX_SPEED / speed
            target.setLinvel({x: v.x * scale, y: v.y * scale, z: v.z * scale}, true)
        }

        const dist = Math.sqrt(distSq)
        const factor = strength * (1 - dist / radius)
        const invDist = factor / dist
        _force.x = dx * invDist
        _force.y = dy * invDist
        _force.z = dz * invDist
        target.addForceAtPoint(_force, tPos, true)
    }
}
