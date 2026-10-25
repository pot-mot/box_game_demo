/**
 * 受击子块领域模型（骨架驱动、纯数学，不建物理碰撞体）。
 *
 * 一个角色由若干受击子块组成，每块绑定一个关节（`jointId`），随骨骼动画世界化；
 * 支持盒 / 球 / 柱三种形状（默认人形用盒），供近战（OBB）/ 远程（点）/ 爆炸（球）统一检定。
 * 块 `id` 稳定且尽量对应骨骼，命中 / 死亡事件据此记录被命中的块数组（范围伤害可命中多块）。
 */

/** 纯数据三维向量（领域层自持，避免反向依赖物理/实体层） */
export interface HurtVec3 {
    x: number
    y: number
    z: number
}

/** 受击形状种类 */
export const HURT_SHAPE_KINDS = ['box', 'sphere', 'cylinder'] as const
export type HurtShapeKind = typeof HURT_SHAPE_KINDS[number]

/** 关节局部空间的受击形状 */
export type HurtShape =
    | {readonly kind: 'box'; readonly half: HurtVec3}
    | {readonly kind: 'sphere'; readonly radius: number}
    /** 轴向 = 关节局部 +Y */
    | {readonly kind: 'cylinder'; readonly radius: number; readonly height: number}

/** 受击子块定义（预设数据） */
export interface HurtBlock {
    /** 稳定 id（尽量 = 骨骼 id），用于事件记录与调试 */
    readonly id: string
    /** 控制的关节 id */
    readonly jointId: string
    readonly shape: HurtShape
    /** 相对关节局部的偏移 */
    readonly offsetLocal?: HurtVec3
    /** 相对关节局部的欧拉角旋转（弧度，XYZ；缺省 0） */
    readonly rotationLocal?: HurtVec3
}

export type HurtBlockProfile = readonly HurtBlock[]

/** 世界空间受击块（逐帧世界化，就地刷新；供命中检定） */
export interface WorldHurtBlock {
    id: string
    kind: HurtShapeKind
    center: HurtVec3
    /** 三个正交单位轴（盒 / 柱朝向） */
    axes: [HurtVec3, HurtVec3, HurtVec3]
    /** 盒半长（仅 kind==='box' 有效） */
    half: HurtVec3
    /** 球 / 柱半径 */
    radius: number
    /** 柱半高（仅 kind==='cylinder' 有效） */
    halfHeight: number
}

const boxHalfOf = (block: HurtBlock): HurtVec3 =>
    block.shape.kind === 'box' ? block.shape.half : {x: 0, y: 0, z: 0}

/**
 * 把受击块经关节世界变换矩阵（列主序 elements）世界化（无视觉部件时的兜底路径）：
 * 盒半长按各列缩放；球半径取三列长度均值；柱半径取水平列均值、半高按 Y 列缩放。
 */
export const worldizeHurtBlock = (block: HurtBlock, elements: readonly number[]): WorldHurtBlock => {
    const c0 = {x: elements[0], y: elements[1], z: elements[2]}
    const c1 = {x: elements[4], y: elements[5], z: elements[6]}
    const c2 = {x: elements[8], y: elements[9], z: elements[10]}
    const len0 = Math.hypot(c0.x, c0.y, c0.z) || 1
    const len1 = Math.hypot(c1.x, c1.y, c1.z) || 1
    const len2 = Math.hypot(c2.x, c2.y, c2.z) || 1
    const off = block.offsetLocal ?? {x: 0, y: 0, z: 0}
    const center = {
        x: elements[12] + c0.x * off.x + c1.x * off.y + c2.x * off.z,
        y: elements[13] + c0.y * off.x + c1.y * off.y + c2.y * off.z,
        z: elements[14] + c0.z * off.x + c1.z * off.y + c2.z * off.z,
    }
    const rx = block.rotationLocal?.x ?? 0
    const ry = block.rotationLocal?.y ?? 0
    const rz = block.rotationLocal?.z ?? 0
    const localAxes: [HurtVec3, HurtVec3, HurtVec3] = [
        rotateEuler({x: 1, y: 0, z: 0}, rx, ry, rz),
        rotateEuler({x: 0, y: 1, z: 0}, rx, ry, rz),
        rotateEuler({x: 0, y: 0, z: 1}, rx, ry, rz),
    ]
    const axes: [HurtVec3, HurtVec3, HurtVec3] = [
        normalize({
            x: c0.x * localAxes[0].x + c1.x * localAxes[0].y + c2.x * localAxes[0].z,
            y: c0.y * localAxes[0].x + c1.y * localAxes[0].y + c2.y * localAxes[0].z,
            z: c0.z * localAxes[0].x + c1.z * localAxes[0].y + c2.z * localAxes[0].z,
        }),
        normalize({
            x: c0.x * localAxes[1].x + c1.x * localAxes[1].y + c2.x * localAxes[1].z,
            y: c0.y * localAxes[1].x + c1.y * localAxes[1].y + c2.y * localAxes[1].z,
            z: c0.z * localAxes[1].x + c1.z * localAxes[1].y + c2.z * localAxes[1].z,
        }),
        normalize({
            x: c0.x * localAxes[2].x + c1.x * localAxes[2].y + c2.x * localAxes[2].z,
            y: c0.y * localAxes[2].x + c1.y * localAxes[2].y + c2.y * localAxes[2].z,
            z: c0.z * localAxes[2].x + c1.z * localAxes[2].y + c2.z * localAxes[2].z,
        }),
    ]
    const hb = boxHalfOf(block)
    const half = {x: hb.x * len0, y: hb.y * len1, z: hb.z * len2}
    let radius = 0
    let halfHeight = 0
    if (block.shape.kind === 'sphere') {
        radius = block.shape.radius * ((len0 + len1 + len2) / 3)
    } else if (block.shape.kind === 'cylinder') {
        radius = block.shape.radius * ((len0 + len2) / 2)
        halfHeight = (block.shape.height / 2) * len1
    }
    return {id: block.id, kind: block.shape.kind, center, axes, half, radius, halfHeight}
}

const normalize = (v: HurtVec3): HurtVec3 => {
    const len = Math.hypot(v.x, v.y, v.z) || 1
    return {x: v.x / len, y: v.y / len, z: v.z / len}
}

/** 绕 XYZ 欧拉角旋转向量（与 three Euler 'XYZ' 一致的最小实现，领域层不依赖 three） */
const rotateEuler = (v: HurtVec3, rx: number, ry: number, rz: number): HurtVec3 => {
    const cx = Math.cos(rx); const sx = Math.sin(rx)
    const cy = Math.cos(ry); const sy = Math.sin(ry)
    const cz = Math.cos(rz); const sz = Math.sin(rz)
    /* 先 X，再 Y，再 Z */
    const y1 = v.y * cx - v.z * sx
    const z1 = v.y * sx + v.z * cx
    const x2 = v.x * cy + z1 * sy
    const z2 = -v.x * sy + z1 * cy
    const x3 = x2 * cz - y1 * sz
    const y3 = x2 * sz + y1 * cz
    return {x: x3, y: y3, z: z2}
}

/** 生成占位世界受击块（预分配到 entity.hurtBlocks，逐帧就地刷新，避免每帧分配） */
export const zeroWorldHurtBlock = (id: string): WorldHurtBlock => ({
    id,
    kind: 'box',
    center: {x: 0, y: 0, z: 0},
    axes: [{x: 1, y: 0, z: 0}, {x: 0, y: 1, z: 0}, {x: 0, y: 0, z: 1}],
    half: {x: 0, y: 0, z: 0},
    radius: 0,
    halfHeight: 0,
})
