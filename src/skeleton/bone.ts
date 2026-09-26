import {Vector3} from 'three'
import type {SkeletonJoint} from './joint.ts'
import type {Skeleton} from './skeleton.ts'
import {rotateJointSubtree, translateJointSubtree} from './skeleton.ts'

/**
 * 骨骼段（≈ 关节对之间的段）：
 * - 方向与长度由两端关节位置派生，不自存方向/长度（避免双份状态冗余）；
 * - length 是运行时动态值（面板/IK 调整），不参与动画关键帧记录；
 * - roll 是骨骼段唯一被动画记录的自由度（绕段轴扭转角）。
 */
export interface SkeletonBone {
    readonly id: string
    readonly name: string
    readonly head: SkeletonJoint
    readonly tail: SkeletonJoint
    /** 段长（运行时动态值；<= 0 时 addBone 按两端世界距离自动取值） */
    length: number
    /** 绕段轴（head→tail 方向）的扭转角（rad） */
    roll: number
}

/** 创建骨骼段。length 默认 0（由 skeleton.addBone 按世界距离自动取值） */
export const createSkeletonBone = (
    name: string,
    head: SkeletonJoint,
    tail: SkeletonJoint,
    length = 0,
    id?: string,
): SkeletonBone => ({
    id: id ?? `${head.id}__${tail.id}`,
    name,
    head,
    tail,
    length,
    roll: 0,
})

/** 世界空间段方向单位向量（派生值）；两端重合时返回零向量 */
export const boneDirection = (skeleton: Skeleton, bone: SkeletonBone): Vector3 => {
    skeleton.updateWorldTransforms()
    const headPos = skeleton.getWorldPosition(bone.head.id)
    const tailPos = skeleton.getWorldPosition(bone.tail.id)
    if (headPos === undefined || tailPos === undefined) return new Vector3()
    return tailPos.clone().sub(headPos).normalize()
}

/** 绕 head 关节世界位置刚体旋转 tail 子树（axis 为世界轴，angle 为弧度）——级联影响全部下游 */
export const rotateBone = (
    skeleton: Skeleton,
    bone: SkeletonBone,
    axis: Vector3,
    angle: number,
): void => {
    skeleton.updateWorldTransforms()
    const headPos = skeleton.getWorldPosition(bone.head.id)
    if (headPos === undefined) return
    rotateJointSubtree(skeleton, bone.tail, headPos, axis, angle)
}

/** 沿当前段方向平移 tail 子树，使段长变为 length——级联影响全部下游 */
export const setBoneLength = (skeleton: Skeleton, bone: SkeletonBone, length: number): void => {
    if (length <= 0) {
        throw new Error(`setBoneLength 失败：长度必须为正数（${length}）`)
    }
    skeleton.updateWorldTransforms()
    const headPos = skeleton.getWorldPosition(bone.head.id)
    const tailPos = skeleton.getWorldPosition(bone.tail.id)
    if (headPos === undefined || tailPos === undefined) return
    const direction = tailPos.clone().sub(headPos)
    if (direction.lengthSq() < 1e-12) return
    const delta = direction.normalize().multiplyScalar(length).add(headPos).sub(tailPos)
    translateJointSubtree(skeleton, bone.tail, delta)
}

/** 设置绕段轴扭转角（仅写字段，姿态由 updateWorldTransforms/applyPose 应用） */
export const setBoneRoll = (bone: SkeletonBone, roll: number): void => {
    bone.roll = roll
}

/**
 * 从两端关节当前世界位置回写段长：`length` 是**派生缓存**（真源为关节位置），
 * 编辑器拖拽/面板/IK 修改关节后调用，保证面板显示与外观缩放始终与骨架一致。
 */
export const syncBoneLengths = (skeleton: Skeleton): void => {
    skeleton.updateWorldTransforms()
    for (const bone of skeleton.bones.values()) {
        const headPos = skeleton.getWorldPosition(bone.head.id)
        const tailPos = skeleton.getWorldPosition(bone.tail.id)
        if (headPos === undefined || tailPos === undefined) continue
        bone.length = headPos.distanceTo(tailPos)
    }
}