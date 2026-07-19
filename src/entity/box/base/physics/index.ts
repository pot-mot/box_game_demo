import {GROUND_Y} from '../../../../physics/constants.ts'
import type {BoxSize} from '../types'

export const OVERLAP_MAX_ATTEMPTS = 50

interface OverlapBox {
    mesh: {position: {x: number; y: number; z: number}}
    config: BoxSize
}

export const findNonOverlappingY = <T extends OverlapBox>(
    boxes: T[],
    config: BoxSize,
    x: number,
    y: number,
    z: number,
    skipIf?: (box: T) => boolean,
): number => {
    let py = y
    const halfH = config.height / 2
    if (py - halfH < GROUND_Y) py = GROUND_Y + halfH
    const hx = config.width / 2
    const hz = config.depth / 2
    for (let attempt = 0; attempt < OVERLAP_MAX_ATTEMPTS; attempt++) {
        let overlap = false
        for (const other of boxes) {
            if (skipIf?.(other)) continue
            const ohx = other.config.width / 2
            const ohy = other.config.height / 2
            const ohz = other.config.depth / 2
            const dx = Math.abs(py - other.mesh.position.y)
            const dy = Math.abs(x - other.mesh.position.x)
            const dz = Math.abs(z - other.mesh.position.z)
            if (dx < halfH + ohy && dy < hx + ohx && dz < hz + ohz) {
                overlap = true
                py = other.mesh.position.y + ohy + halfH
                break
            }
        }
        if (!overlap) break
    }
    return py
}
