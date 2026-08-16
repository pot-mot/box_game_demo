/** 三维向量（纯数据，供几何判定复用） */
export interface Vec3Like {
    readonly x: number
    readonly y: number
    readonly z: number
}

/** 方向包围盒：中心 + 三轴半长 + 三个正交单位轴 */
export interface OBB {
    readonly center: Vec3Like
    readonly half: Vec3Like
    readonly axes: readonly [Vec3Like, Vec3Like, Vec3Like]
}

const dot = (a: Vec3Like, b: Vec3Like): number => a.x * b.x + a.y * b.y + a.z * b.z

/** 绕 Y 轴旋转 yaw 的 OBB（角色朝向驱动的箱子：受击箱 / 攻击检测箱）。
 * 轴约定与 Three.js rotation.y 一致：local X → (cos, 0, -sin)，local Z → (sin, 0, cos) */
export const yawOBB = (
    cx: number, cy: number, cz: number,
    hx: number, hy: number, hz: number,
    yaw: number,
): OBB => {
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    return {
        center: {x: cx, y: cy, z: cz},
        half: {x: hx, y: hy, z: hz},
        axes: [
            {x: cos, y: 0, z: -sin},
            {x: 0, y: 1, z: 0},
            {x: sin, y: 0, z: cos},
        ],
    }
}

/**
 * 从 4×4 变换矩阵（列主序 elements，如 Three.js matrixWorld）与本地盒参数构造世界空间 OBB。
 * 矩阵列向量含缩放：轴取归一化方向，半长按对应列向量长度缩放。
 */
export const obbFromTransform = (
    elements: readonly number[],
    localCenter: Vec3Like,
    localHalf: Vec3Like,
): OBB => {
    /* 列向量（含缩放） */
    const c0 = {x: elements[0], y: elements[1], z: elements[2]}
    const c1 = {x: elements[4], y: elements[5], z: elements[6]}
    const c2 = {x: elements[8], y: elements[9], z: elements[10]}
    const len0 = Math.hypot(c0.x, c0.y, c0.z) || 1
    const len1 = Math.hypot(c1.x, c1.y, c1.z) || 1
    const len2 = Math.hypot(c2.x, c2.y, c2.z) || 1

    return {
        center: {
            x: elements[12] + c0.x * localCenter.x + c1.x * localCenter.y + c2.x * localCenter.z,
            y: elements[13] + c0.y * localCenter.x + c1.y * localCenter.y + c2.y * localCenter.z,
            z: elements[14] + c0.z * localCenter.x + c1.z * localCenter.y + c2.z * localCenter.z,
        },
        half: {
            x: localHalf.x * len0,
            y: localHalf.y * len1,
            z: localHalf.z * len2,
        },
        axes: [
            {x: c0.x / len0, y: c0.y / len0, z: c0.z / len0},
            {x: c1.x / len1, y: c1.y / len1, z: c1.z / len1},
            {x: c2.x / len2, y: c2.y / len2, z: c2.z / len2},
        ],
    }
}

/**
 * OBB-OBB 相交检测（分离轴定理，15 轴：双方各 3 轴 + 9 组叉积轴）。
 * 参考 Gottschalk OBBTree 经典实现；叉积轴接近零（两轴近平行）时跳过该轴。
 */
export const obbIntersect = (a: OBB, b: OBB): boolean => {
    const EPS = 1e-6
    /* R[i][j] = dot(a.axes[i], b.axes[j])；|R| 加 eps 避免叉积轴退化时的数值误差 */
    const R: number[][] = [[], [], []]
    const AbsR: number[][] = [[], [], []]
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            R[i][j] = dot(a.axes[i], b.axes[j])
            AbsR[i][j] = Math.abs(R[i][j]) + EPS
        }
    }

    /* 平移向量在 A 坐标系下的表示 */
    const dx = b.center.x - a.center.x
    const dy = b.center.y - a.center.y
    const dz = b.center.z - a.center.z
    const t = [
        dx * a.axes[0].x + dy * a.axes[0].y + dz * a.axes[0].z,
        dx * a.axes[1].x + dy * a.axes[1].y + dz * a.axes[1].z,
        dx * a.axes[2].x + dy * a.axes[2].y + dz * a.axes[2].z,
    ]
    const ah = [a.half.x, a.half.y, a.half.z]
    const bh = [b.half.x, b.half.y, b.half.z]

    /* A 的 3 条轴 */
    for (let i = 0; i < 3; i++) {
        const ra = ah[i]
        const rb = bh[0] * AbsR[i][0] + bh[1] * AbsR[i][1] + bh[2] * AbsR[i][2]
        if (Math.abs(t[i]) > ra + rb) return false
    }

    /* B 的 3 条轴 */
    for (let j = 0; j < 3; j++) {
        const ra = ah[0] * AbsR[0][j] + ah[1] * AbsR[1][j] + ah[2] * AbsR[2][j]
        const rb = bh[j]
        const tj = t[0] * R[0][j] + t[1] * R[1][j] + t[2] * R[2][j]
        if (Math.abs(tj) > ra + rb) return false
    }

    /* 9 条叉积轴 A_i × B_j */
    const cross = (i: number, j: number): boolean => {
        const i1 = (i + 1) % 3
        const i2 = (i + 2) % 3
        const j1 = (j + 1) % 3
        const j2 = (j + 2) % 3
        const ra = ah[i1] * AbsR[i2][j] + ah[i2] * AbsR[i1][j]
        const rb = bh[j1] * AbsR[i][j2] + bh[j2] * AbsR[i][j1]
        const tc = t[i2] * R[i1][j] - t[i1] * R[i2][j]
        return Math.abs(tc) > ra + rb
    }
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (cross(i, j)) return false
        }
    }

    return true
}
