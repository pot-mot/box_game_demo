import type RAPIER from '@dimforge/rapier3d-compat'
import {quatVmult, type RapQuaternion, type RapVector3} from '../../../physics/rapier_utils.ts'
import type {AreaShape} from '../types/index.ts'
import {OVERLAP_QUADRATURE_ORDER} from './constants.ts'

/** 区域与刚体的重叠结果 */
export interface OverlapResult {
    /** 重叠体积（m³）—— 浮力按浸没体积计算 */
    volume: number
    /** 浸没比例（0..1）= 重叠体积 / 刚体 AABB 体积 */
    fraction: number
}

/** 区域局部坐标下的轴对齐盒（刚体 AABB 变换到区域局部后的包围盒） */
interface LocalAabb {
    minX: number
    maxX: number
    minY: number
    maxY: number
    minZ: number
    maxZ: number
}

const _corner: RapVector3 = {x: 0, y: 0, z: 0}
const _offset: RapVector3 = {x: 0, y: 0, z: 0}
const _half: RapVector3 = {x: 0.5, y: 0.5, z: 0.5}
const _invQuat: RapQuaternion = {x: 0, y: 0, z: 0, w: 1}
const _unionPos: RapVector3 = {x: 0, y: 0, z: 0}
const _unionHalf: RapVector3 = {x: 0, y: 0, z: 0}

// ── Gauss–Legendre 数值积分（球 / 柱重叠体积用；盒走闭式）──

const gaussCache = new Map<number, {nodes: Float64Array; weights: Float64Array}>()

const legendre = (n: number, x: number): {p: number; dp: number} => {
    let p0 = 1
    let p1 = x
    for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k
        p0 = p1
        p1 = p2
    }
    const dp = n * (x * p1 - p0) / (x * x - 1)
    return {p: p1, dp}
}

const gaussLegendre = (n: number): {nodes: Float64Array; weights: Float64Array} => {
    const cached = gaussCache.get(n)
    if (cached !== undefined) return cached
    const nodes = new Float64Array(n)
    const weights = new Float64Array(n)
    for (let i = 0; i < n; i++) {
        let x = Math.cos(Math.PI * (i + 0.75) / (n + 0.5))
        for (let iter = 0; iter < 100; iter++) {
            const {p, dp} = legendre(n, x)
            const dx = p / dp
            x -= dx
            if (Math.abs(dx) < 1e-15) break
        }
        const {dp} = legendre(n, x)
        nodes[i] = x
        weights[i] = 2 / ((1 - x * x) * dp * dp)
    }
    const result = {nodes, weights}
    gaussCache.set(n, result)
    return result
}

/** 定积分 ∫_a^b f(x) dx（Gauss–Legendre） */
const integrate = (a: number, b: number, n: number, f: (x: number) => number): number => {
    if (b <= a) return 0
    const {nodes, weights} = gaussLegendre(n)
    const half = (b - a) / 2
    const mid = (a + b) / 2
    let sum = 0
    for (let i = 0; i < n; i++) sum += weights[i] * f(mid + half * nodes[i])
    return sum * half
}

// ── 形状重叠原语（均基于区域局部的刚体 AABB，轴对齐）──

/** 盒体区域：逐轴求交（局部 AABB vs 轴对齐盒）——精确闭式 */
const boxOverlapVolume = (a: LocalAabb, hw: number, hh: number, hd: number): number => {
    const ox = Math.min(a.maxX, hw) - Math.max(a.minX, -hw)
    const oy = Math.min(a.maxY, hh) - Math.max(a.minY, -hh)
    const oz = Math.min(a.maxZ, hd) - Math.max(a.minZ, -hd)
    if (ox <= 0 || oy <= 0 || oz <= 0) return 0
    return ox * oy * oz
}

/** 水平条带面积 ∫_{ya}^{yb} 2√(R²−y²) dy 的解析原函数（圆盘介于 y=ya..yb 的面积） */
const stripArea = (ya: number, yb: number, r: number): number => {
    const a = Math.max(-r, Math.min(r, ya))
    const b = Math.max(-r, Math.min(r, yb))
    if (b <= a) return 0
    const f = (t: number): number => t * Math.sqrt(Math.max(0, r * r - t * t)) + r * r * Math.asin(Math.max(-1, Math.min(1, t / r)))
    return Math.max(0, f(b) - f(a))
}

/** 圆盘（半径 r，圆心原点，位于 xy 平面）与轴对齐矩形的交面积 */
const diskRectArea = (r: number, x0: number, x1: number, y0: number, y1: number): number => {
    if (r <= 0) return 0
    const xa = Math.max(x0, -r)
    const xb = Math.min(x1, r)
    const ya = Math.max(y0, -r)
    const yb = Math.min(y1, r)
    if (xa >= xb || ya >= yb) return 0
    const eps = 1e-9
    /* 矩形在某一轴完全覆盖圆盘 → 用条带解析式，避免根式奇异 */
    if (xa <= -r + eps && xb >= r - eps) return stripArea(ya, yb, r)
    if (ya <= -r + eps && yb >= r - eps) return stripArea(xa, xb, r)
    const n = OVERLAP_QUADRATURE_ORDER
    return integrate(xa, xb, n, (x) => {
        const s = r * r - x * x
        if (s <= 0) return 0
        const root = Math.sqrt(s)
        return Math.max(0, Math.min(yb, root) - Math.max(ya, -root))
    })
}

/** 球形区域与 AABB 的重叠体积：沿 z 积分圆盘∩矩形面积 */
const sphereOverlapVolume = (a: LocalAabb, r: number): number => {
    const za = Math.max(a.minZ, -r)
    const zb = Math.min(a.maxZ, r)
    if (za >= zb) return 0
    const n = OVERLAP_QUADRATURE_ORDER
    return integrate(za, zb, n, (z) => {
        const s = r * r - z * z
        if (s <= 0) return 0
        return diskRectArea(Math.sqrt(s), a.minX, a.maxX, a.minY, a.maxY)
    })
}

/** 柱形区域（轴向局部 +Y）与 AABB 的重叠体积：截面圆盘∩矩形面积 × 高度重叠（截面在 y 上恒定） */
const cylinderOverlapVolume = (a: LocalAabb, r: number, height: number): number => {
    const half = height / 2
    const hy = Math.min(a.maxY, half) - Math.max(a.minY, -half)
    if (hy <= 0) return 0
    return hy * diskRectArea(r, a.minX, a.maxX, a.minZ, a.maxZ)
}

/** 从碰撞体形状读取世界 AABB 半尺寸（盒 / 胶囊 / 球；未知回退 0.5），写入 `out` */
const aabbHalfExtentsOf = (out: RapVector3, collider: RAPIER.Collider): void => {
    const shape = collider.shape as unknown as {halfExtents?: RapVector3; radius?: number; halfHeight?: number}
    if (shape.halfExtents) {
        out.x = shape.halfExtents.x
        out.y = shape.halfExtents.y
        out.z = shape.halfExtents.z
        return
    }
    if (shape.halfHeight !== undefined && shape.radius !== undefined) {
        /* 胶囊（角色）：AABB 半高 = halfHeight + radius，水平半宽 = radius */
        out.x = shape.radius
        out.y = shape.halfHeight + shape.radius
        out.z = shape.radius
        return
    }
    if (shape.radius !== undefined) {
        out.x = shape.radius
        out.y = shape.radius
        out.z = shape.radius
        return
    }
    out.x = 0.5
    out.y = 0.5
    out.z = 0.5
}

/** 把刚体世界 AABB 的 8 角变换到区域局部，求局部 AABB */
const localAabbOfBody = (
    out: LocalAabb,
    bodyPos: RapVector3,
    half: RapVector3,
    areaPos: RapVector3,
    invQuat: RapQuaternion,
): void => {
    out.minX = Infinity; out.maxX = -Infinity
    out.minY = Infinity; out.maxY = -Infinity
    out.minZ = Infinity; out.maxZ = -Infinity
    for (let i = 0; i < 8; i++) {
        _corner.x = bodyPos.x + ((i & 1) === 0 ? -half.x : half.x)
        _corner.y = bodyPos.y + ((i & 2) === 0 ? -half.y : half.y)
        _corner.z = bodyPos.z + ((i & 4) === 0 ? -half.z : half.z)
        _offset.x = _corner.x - areaPos.x
        _offset.y = _corner.y - areaPos.y
        _offset.z = _corner.z - areaPos.z
        quatVmult(_corner, invQuat, _offset)
        if (_corner.x < out.minX) out.minX = _corner.x
        if (_corner.x > out.maxX) out.maxX = _corner.x
        if (_corner.y < out.minY) out.minY = _corner.y
        if (_corner.y > out.maxY) out.maxY = _corner.y
        if (_corner.z < out.minZ) out.minZ = _corner.z
        if (_corner.z > out.maxZ) out.maxZ = _corner.z
    }
}

const _local: LocalAabb = {minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0}

/**
 * 采样刚体 AABB 与区域形状的重叠体积与浸没比例。
 * 盒走精确闭式；球 / 柱用高精度 Gauss–Legendre 数值积分（球沿轴降为二重、柱退化为解析一重）。
 * 旋转区域：先把刚体 AABB 变换到区域局部（与既有水体实现一致，区域旋转时为 AABB 近似）。
 */
export const sampleOverlap = (
    body: RAPIER.RigidBody,
    shape: AreaShape,
    areaPos: RapVector3,
    areaQuat: RapQuaternion,
): OverlapResult | undefined => {
    const num = body.numColliders()
    if (num === 0) return undefined
    /* 刚体可能有多个碰撞体（如角色上/下半身两半胶囊）：取全部碰撞体世界 AABB 的并集 */
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (let i = 0; i < num; i++) {
        const collider = body.collider(i)
        if (!collider) continue
        aabbHalfExtentsOf(_half, collider)
        const t = collider.translation()
        if (t.x - _half.x < minX) minX = t.x - _half.x
        if (t.y - _half.y < minY) minY = t.y - _half.y
        if (t.z - _half.z < minZ) minZ = t.z - _half.z
        if (t.x + _half.x > maxX) maxX = t.x + _half.x
        if (t.y + _half.y > maxY) maxY = t.y + _half.y
        if (t.z + _half.z > maxZ) maxZ = t.z + _half.z
    }
    if (!(maxX > minX) || !(maxY > minY) || !(maxZ > minZ)) return undefined
    _unionPos.x = (minX + maxX) / 2
    _unionPos.y = (minY + maxY) / 2
    _unionPos.z = (minZ + maxZ) / 2
    _unionHalf.x = (maxX - minX) / 2
    _unionHalf.y = (maxY - minY) / 2
    _unionHalf.z = (maxZ - minZ) / 2
    const bodyVolume = 8 * _unionHalf.x * _unionHalf.y * _unionHalf.z
    if (bodyVolume <= 0) return undefined
    _invQuat.x = -areaQuat.x
    _invQuat.y = -areaQuat.y
    _invQuat.z = -areaQuat.z
    _invQuat.w = areaQuat.w
    localAabbOfBody(_local, _unionPos, _unionHalf, areaPos, _invQuat)
    let volume: number
    if (shape.kind === 'box') {
        volume = boxOverlapVolume(_local, shape.width / 2, shape.height / 2, shape.depth / 2)
    } else if (shape.kind === 'sphere') {
        volume = sphereOverlapVolume(_local, shape.radius)
    } else {
        volume = cylinderOverlapVolume(_local, shape.radius, shape.height)
    }
    if (volume <= 0) return undefined
    return {volume, fraction: Math.min(1, volume / bodyVolume)}
}
