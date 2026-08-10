# 01 — 新建向量 / 四元数工具层

## 涉及文件

| 操作 | 文件 |
|------|------|
| **新建** | `src/physics/rapier_utils.ts` |

## 背景

cannon-es 的 `Vec3` 是类实例（`new Vec3(x,y,z)`），自带 `.set()` `.length()` `.scale()` `.vmult()` 等方法。
项目中大量使用 `new Vec3()` 创建临时向量做数学运算（爆炸、近战、角色分离等）。

Rapier 的所有向量返回纯 `{x, y, z}` 对象。需要一组纯函数风格的向量工具来替代。

## 新建文件：`src/physics/rapier_utils.ts`

```ts
/** 纯对象向量 —— 对齐 Rapier 的 {x, y, z} 格式 */
export interface RapVector3 {
    x: number
    y: number
    z: number
}

export interface RapQuaternion {
    x: number
    y: number
    z: number
    w: number
}

// ── 构造 ──

export const v3 = (x: number, y: number, z: number): RapVector3 => ({ x, y, z })

export const q4 = (x: number, y: number, z: number, w: number): RapQuaternion => ({ x, y, z, w })

// ── 向量运算 ──

export const v3Set = (out: RapVector3, x: number, y: number, z: number): void => {
    out.x = x; out.y = y; out.z = z
}

export const v3Copy = (out: RapVector3, src: RapVector3): void => {
    out.x = src.x; out.y = src.y; out.z = src.z
}

export const v3Clone = (src: RapVector3): RapVector3 => ({ x: src.x, y: src.y, z: src.z })

export const v3Length = (v: RapVector3): number =>
    Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)

export const v3Dist = (a: RapVector3, b: RapVector3): number => {
    const dx = a.x - b.x
    const dy = a.y - b.y
    const dz = a.z - b.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** 归一化：out = v / |v|。若长度接近 0 则返回零向量 */
export const v3Normalize = (out: RapVector3, v: RapVector3): number => {
    const len = v3Length(v)
    if (len < 1e-10) {
        out.x = 0; out.y = 0; out.z = 0
        return 0
    }
    out.x = v.x / len
    out.y = v.y / len
    out.z = v.z / len
    return len
}

export const v3Scale = (out: RapVector3, src: RapVector3, s: number): void => {
    out.x = src.x * s; out.y = src.y * s; out.z = src.z * s
}

export const v3Sub = (out: RapVector3, a: RapVector3, b: RapVector3): void => {
    out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z
}

export const v3Add = (out: RapVector3, a: RapVector3, b: RapVector3): void => {
    out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z
}

/** 四元数旋转向量：out = q * v * q⁻¹ */
export const quatVmult = (out: RapVector3, q: RapQuaternion, v: RapVector3): void => {
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w
    const vx = v.x, vy = v.y, vz = v.z

    // q * v（四元数乘法，v 视为 w=0 的四元数）
    const ix = qw * vx + qy * vz - qz * vy
    const iy = qw * vy + qz * vx - qx * vz
    const iz = qw * vz + qx * vy - qy * vx
    const iw = -qx * vx - qy * vy - qz * vz

    // 结果 * q⁻¹（q⁻¹ = conjugate = (-qx, -qy, -qz, qw)）
    out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy
    out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz
    out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx
}

/** 四元数乘法：out = a * b */
export const quatMul = (out: RapQuaternion, a: RapQuaternion, b: RapQuaternion): void => {
    const aw = a.w, ax = a.x, ay = a.y, az = a.z
    const bw = b.w, bx = b.x, by = b.y, bz = b.z
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
```

## 使用方式

后续所有文件中，将 cannon-es 的 `Vec3` 运算替换为：

```ts
// cannon-es（旧）
import {Vec3} from 'cannon-es'
const _tmp = new Vec3()
_tmp.set(x, y, z)
const dist = _tmp.length()

// Rapier（新）
import {v3Set, v3Length} from '../../physics/rapier_utils.ts'
const _tmp = { x: 0, y: 0, z: 0 }
v3Set(_tmp, x, y, z)
const dist = v3Length(_tmp)
```

## 注意事项

1. 这些函数是**纯函数式**的，不创建新对象（除 `v3()` `v3Clone()` 外），避免 GC 压力。
2. `quatVmult()` 仅在 terrain `computeBodyPos()` 中使用，其余场景（角色、战斗）用不到四元数旋转向量。
3. 此文件不依赖任何 cannon-es 或 Rapier API，仅做纯数学运算，可以在任何步骤安全引入。
