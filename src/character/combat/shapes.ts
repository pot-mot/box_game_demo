import type {HurtVec3, WorldHurtBlock} from '../hurt_blocks.ts'

/**
 * 受击形状相交检定（领域层，纯数学，不依赖实体/物理层）：
 * 远程弹丸点 / 爆炸球 × 受击块（盒 / 球 / 柱）。
 * 近战武器 OBB 的检定在实体层（`entity/character/combat/shapes.ts`，需要 OBB SAT）。
 *
 * 柱以「沿轴线段 + 半径」近似（端部为圆角，略保守）。
 */

/** 点到线段的最近距离 */
const pointSegmentDistance = (px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number => {
    const vx = bx - ax
    const vy = by - ay
    const vz = bz - az
    const wx = px - ax
    const wy = py - ay
    const wz = pz - az
    const vv = vx * vx + vy * vy + vz * vz
    const t = vv > 1e-12 ? Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / vv)) : 0
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t), pz - (az + vz * t))
}

/** 柱的轴线段端点（世界）：中心 ± 轴 × 半高 */
const cylinderEndpoints = (b: WorldHurtBlock): {a: HurtVec3; b: HurtVec3} => {
    const ax = b.axes[1]
    return {
        a: {x: b.center.x + ax.x * b.halfHeight, y: b.center.y + ax.y * b.halfHeight, z: b.center.z + ax.z * b.halfHeight},
        b: {x: b.center.x - ax.x * b.halfHeight, y: b.center.y - ax.y * b.halfHeight, z: b.center.z - ax.z * b.halfHeight},
    }
}

/** 世界点到盒中心的三个局部坐标 */
const boxLocal = (b: WorldHurtBlock, px: number, py: number, pz: number): HurtVec3 => {
    const dx = px - b.center.x
    const dy = py - b.center.y
    const dz = pz - b.center.z
    return {
        x: dx * b.axes[0].x + dy * b.axes[0].y + dz * b.axes[0].z,
        y: dx * b.axes[1].x + dy * b.axes[1].y + dz * b.axes[1].z,
        z: dx * b.axes[2].x + dy * b.axes[2].y + dz * b.axes[2].z,
    }
}

/** 点到盒（轴对齐局部）的最近距离 */
const pointToBoxDistance = (b: WorldHurtBlock, px: number, py: number, pz: number): number => {
    const l = boxLocal(b, px, py, pz)
    const cx = Math.max(-b.half.x, Math.min(b.half.x, l.x))
    const cy = Math.max(-b.half.y, Math.min(b.half.y, l.y))
    const cz = Math.max(-b.half.z, Math.min(b.half.z, l.z))
    return Math.hypot(l.x - cx, l.y - cy, l.z - cz)
}

/** 世界点是否落在受击块内 */
export const pointIntersectsHurt = (px: number, py: number, pz: number, b: WorldHurtBlock): boolean => {
    if (b.kind === 'box') {
        const l = boxLocal(b, px, py, pz)
        return Math.abs(l.x) <= b.half.x && Math.abs(l.y) <= b.half.y && Math.abs(l.z) <= b.half.z
    }
    if (b.kind === 'sphere') return Math.hypot(px - b.center.x, py - b.center.y, pz - b.center.z) <= b.radius
    const {a, b: e} = cylinderEndpoints(b)
    return pointSegmentDistance(px, py, pz, a.x, a.y, a.z, e.x, e.y, e.z) <= b.radius
}

/** 世界球是否与受击块相交 */
export const sphereIntersectsHurt = (cx: number, cy: number, cz: number, r: number, b: WorldHurtBlock): boolean => {
    if (b.kind === 'box') return pointToBoxDistance(b, cx, cy, cz) <= r
    if (b.kind === 'sphere') return Math.hypot(cx - b.center.x, cy - b.center.y, cz - b.center.z) <= r + b.radius
    const {a, b: e} = cylinderEndpoints(b)
    return pointSegmentDistance(cx, cy, cz, a.x, a.y, a.z, e.x, e.y, e.z) <= r + b.radius
}

/** 线段（a→b）与线段的最近距离（用于子弹扫掠 × 柱近似） */
const segmentSegmentDistance = (
    p1x: number, p1y: number, p1z: number, q1x: number, q1y: number, q1z: number,
    p2x: number, p2y: number, p2z: number, q2x: number, q2y: number, q2z: number,
): number => {
    const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z
    const d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z
    const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z
    const a = d1x * d1x + d1y * d1y + d1z * d1z
    const e = d2x * d2x + d2y * d2y + d2z * d2z
    const f = d2x * rx + d2y * ry + d2z * rz
    let s = 0
    let t = 0
    if (a <= 1e-12 && e <= 1e-12) return Math.hypot(rx, ry, rz)
    if (a <= 1e-12) {
        t = Math.max(0, Math.min(1, f / e))
    } else {
        const c = d1x * rx + d1y * ry + d1z * rz
        if (e <= 1e-12) {
            s = Math.max(0, Math.min(1, -c / a))
        } else {
            const bq = d1x * d2x + d1y * d2y + d1z * d2z
            const denom = a * e - bq * bq
            s = denom > 1e-12 ? Math.max(0, Math.min(1, (bq * f - c * e) / denom)) : 0
            t = (bq * s + f) / e
            if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)) }
            else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (bq - c) / a)) }
        }
    }
    const cx = (p1x + d1x * s) - (p2x + d2x * t)
    const cy = (p1y + d1y * s) - (p2y + d2y * t)
    const cz = (p1z + d1z * s) - (p2z + d2z * t)
    return Math.hypot(cx, cy, cz)
}

/** 线段（a→b）是否与受击块相交（子弹扫掠：避免高速弹单点采样漏判） */
export const segmentIntersectsHurt = (
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    b: WorldHurtBlock,
): boolean => {
    if (b.kind === 'box') {
        /* 两端点变换到盒局部，做线段 × 轴对齐盒相交 */
        const la = boxLocal(b, ax, ay, az)
        const lb = boxLocal(b, bx, by, bz)
        const d = {x: lb.x - la.x, y: lb.y - la.y, z: lb.z - la.z}
        let tmin = 0
        let tmax = 1
        const clip = (origin: number, dir: number, half: number): boolean => {
            if (Math.abs(dir) < 1e-12) return origin >= -half && origin <= half
            let t0 = (-half - origin) / dir
            let t1 = (half - origin) / dir
            if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp }
            if (t0 > tmin) tmin = t0
            if (t1 < tmax) tmax = t1
            return tmin <= tmax
        }
        return clip(la.x, d.x, b.half.x) && clip(la.y, d.y, b.half.y) && clip(la.z, d.z, b.half.z)
    }
    if (b.kind === 'sphere') {
        return pointSegmentDistance(b.center.x, b.center.y, b.center.z, ax, ay, az, bx, by, bz) <= b.radius
    }
    const {a, b: e} = cylinderEndpoints(b)
    return segmentSegmentDistance(ax, ay, az, bx, by, bz, a.x, a.y, a.z, e.x, e.y, e.z) <= b.radius
}
