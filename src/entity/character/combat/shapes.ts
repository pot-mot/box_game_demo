import {obbIntersect, type OBB} from './obb.ts'
import type {HurtVec3, WorldHurtBlock} from '../../../character/hurt_blocks.ts'

/**
 * 近战武器 OBB × 受击块（盒 / 球 / 柱）相交检定（实体层；需要 OBB SAT）。
 * 远程点 / 爆炸球的检定见领域层 `character/combat/shapes.ts`。
 * 柱以「沿轴线段 + 半径」近似（端部圆角，略保守）。
 */

const hurtBlockOBB = (b: WorldHurtBlock): OBB => ({center: b.center, half: b.half, axes: b.axes})

/** 点到 OBB 的最近距离（局部 clamp） */
const pointToObbDistance = (obb: OBB, px: number, py: number, pz: number): number => {
    const dx = px - obb.center.x
    const dy = py - obb.center.y
    const dz = pz - obb.center.z
    const lx = dx * obb.axes[0].x + dy * obb.axes[0].y + dz * obb.axes[0].z
    const ly = dx * obb.axes[1].x + dy * obb.axes[1].y + dz * obb.axes[1].z
    const lz = dx * obb.axes[2].x + dy * obb.axes[2].y + dz * obb.axes[2].z
    const cx = Math.max(-obb.half.x, Math.min(obb.half.x, lx))
    const cy = Math.max(-obb.half.y, Math.min(obb.half.y, ly))
    const cz = Math.max(-obb.half.z, Math.min(obb.half.z, lz))
    return Math.hypot(lx - cx, ly - cy, lz - cz)
}

const cylinderEndpoints = (b: WorldHurtBlock): {a: HurtVec3; b: HurtVec3} => {
    const ax = b.axes[1]
    return {
        a: {x: b.center.x + ax.x * b.halfHeight, y: b.center.y + ax.y * b.halfHeight, z: b.center.z + ax.z * b.halfHeight},
        b: {x: b.center.x - ax.x * b.halfHeight, y: b.center.y - ax.y * b.halfHeight, z: b.center.z - ax.z * b.halfHeight},
    }
}

/** 武器 OBB 是否与受击块相交 */
export const obbIntersectsHurt = (obb: OBB, b: WorldHurtBlock): boolean => {
    if (b.kind === 'box') return obbIntersect(obb, hurtBlockOBB(b))
    if (b.kind === 'sphere') return pointToObbDistance(obb, b.center.x, b.center.y, b.center.z) <= b.radius
    const {a, b: e} = cylinderEndpoints(b)
    const SAMPLES = 8
    for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES
        const px = a.x + (e.x - a.x) * t
        const py = a.y + (e.y - a.y) * t
        const pz = a.z + (e.z - a.z) * t
        if (pointToObbDistance(obb, px, py, pz) <= b.radius) return true
    }
    return false
}
