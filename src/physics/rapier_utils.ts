/** Rapier 纯对象向量 —— 对齐 Rapier 的 {x, y, z} 返回格式 */
export interface RapVector3 {
    x: number
    y: number
    z: number
}

/** Rapier 纯对象四元数 —— 对齐 Rapier 的 {x, y, z, w} 返回格式 */
export interface RapQuaternion {
    x: number
    y: number
    z: number
    w: number
}

// ── Rapier 辅助 ──

/**
 * 安全创建碰撞体并附着到父刚体。
 * Rapier 0.20 的类型定义在 TypeScript 6 下 createCollider 第二参数检测异常，
 * 此函数做集中窄化，后续统一通过此入口创建碰撞体。
 */
import type RAPIER from '@dimforge/rapier3d-compat'

export const createColliderForBody = (
    world: RAPIER.World,
    desc: RAPIER.ColliderDesc,
    body: RAPIER.RigidBody | undefined,
): RAPIER.Collider => {
    if (body !== undefined) {
        return world.createCollider(desc, body)
    }
    return world.createCollider(desc)
}

// ── 构造 ──

export const v3 = (x: number, y: number, z: number): RapVector3 => ({ x, y, z })

export const q4 = (x: number, y: number, z: number, w: number): RapQuaternion => ({
    x,
    y,
    z,
    w,
})

// ── 向量运算 ──

export const v3Set = (out: RapVector3, x: number, y: number, z: number): void => {
    out.x = x
    out.y = y
    out.z = z
}

export const v3Copy = (out: RapVector3, src: RapVector3): void => {
    out.x = src.x
    out.y = src.y
    out.z = src.z
}

export const v3Clone = (src: RapVector3): RapVector3 => ({
    x: src.x,
    y: src.y,
    z: src.z,
})

export const v3Length = (v: RapVector3): number =>
    Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)

export const v3Dist = (a: RapVector3, b: RapVector3): number => {
    const dx = a.x - b.x
    const dy = a.y - b.y
    const dz = a.z - b.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** 归一化：out = v / |v|，返回原长度。若长度接近 0 则置零 */
export const v3Normalize = (out: RapVector3, v: RapVector3): number => {
    const len = v3Length(v)
    if (len < 1e-10) {
        out.x = 0
        out.y = 0
        out.z = 0
        return 0
    }
    out.x = v.x / len
    out.y = v.y / len
    out.z = v.z / len
    return len
}

export const v3Scale = (out: RapVector3, src: RapVector3, s: number): void => {
    out.x = src.x * s
    out.y = src.y * s
    out.z = src.z * s
}

export const v3Sub = (out: RapVector3, a: RapVector3, b: RapVector3): void => {
    out.x = a.x - b.x
    out.y = a.y - b.y
    out.z = a.z - b.z
}

export const v3Add = (out: RapVector3, a: RapVector3, b: RapVector3): void => {
    out.x = a.x + b.x
    out.y = a.y + b.y
    out.z = a.z + b.z
}

/** 四元数旋转向量：out = q * v * q⁻¹ */
export const quatVmult = (out: RapVector3, q: RapQuaternion, v: RapVector3): void => {
    const qx = q.x
    const qy = q.y
    const qz = q.z
    const qw = q.w
    const vx = v.x
    const vy = v.y
    const vz = v.z

    const ix = qw * vx + qy * vz - qz * vy
    const iy = qw * vy + qz * vx - qx * vz
    const iz = qw * vz + qx * vy - qy * vx
    const iw = -qx * vx - qy * vy - qz * vz

    out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy
    out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz
    out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx
}

/** 四元数乘法：out = a * b */
export const quatMul = (out: RapQuaternion, a: RapQuaternion, b: RapQuaternion): void => {
    const aw = a.w
    const ax = a.x
    const ay = a.y
    const az = a.z
    const bw = b.w
    const bx = b.x
    const by = b.y
    const bz = b.z
    out.x = aw * bx + ax * bw + ay * bz - az * by
    out.y = aw * by - ax * bz + ay * bw + az * bx
    out.z = aw * bz + ax * by - ay * bx + az * bw
    out.w = aw * bw - ax * bx - ay * by - az * bz
}

/** 从绕轴旋转创建四元数 */
export const quatFromAxisAngle = (axis: RapVector3, angle: number): RapQuaternion => {
    const half = angle / 2
    const s = Math.sin(half)
    return {
        x: axis.x * s,
        y: axis.y * s,
        z: axis.z * s,
        w: Math.cos(half),
    }
}
