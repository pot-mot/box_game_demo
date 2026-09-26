import {Quaternion, Vector3} from 'three'
import type {JointPose, Skeleton, SkeletonPose} from '../skeleton.ts'
import type {BoneAnimationClip} from './types.ts'
import {sampleClip} from './sampling.ts'

/**
 * 骨骼动画组合（Q3：任意 pose 按影响程度 + 时间进度叠加）。
 *
 * 语义（评审确定）：**按关节归一化加权平均**——
 * - 对每个关节，只统计「定义了该关节」的层，把这些层的权重归一化后加权；
 * - 旋转用四元数增量球面插值（等价归一化加权平均，自动走最短路径），位置用增量线性插值；
 * - 权重之和不为 1 也无需归一化到外部：内部按贡献关节的权重占比归一，结果与层顺序无关；
 * - 未被任何层覆盖的关节不出现在结果里（调用方 applyPose 时保留骨架当前值，实现上下半身复用）。
 *
 * 时间进度 `progress`（0-1）：采样时间 = progress × 该 clip 时长（循环 clip 内部再走 wrap）。
 */
export interface PoseLayer {
    /** pose 资产（骨骼关键帧 clip；可为部分关节的稀疏姿势） */
    readonly clip: BoneAnimationClip
    /** 影响程度（>= 0；0 的层不参与） */
    readonly weight: number
    /** 时间进度（0-1）；负值/超过 1 由 clip 的循环/夹取语义处理 */
    readonly progress: number
}

interface JointAccumulator {
    readonly rotation: Quaternion
    readonly position: Vector3
    weight: number
}

interface RollAccumulator {
    roll: number
    weight: number
}

/** 把多个 pose 层合成为单一骨架姿态（按关节归一化加权平均；不修改输入 clip） */
export const composePoses = (layers: readonly PoseLayer[]): SkeletonPose => {
    /* 快速路径：仅一层有效贡献时等价于单 clip 采样，跳过克隆/累加（攻击段等单层场景零额外开销） */
    let effective = 0
    let only: PoseLayer | undefined
    for (const layer of layers) {
        if (layer.weight <= 0) continue
        effective++
        only = layer
        if (effective > 1) break
    }
    if (effective === 1 && only !== undefined) {
        return sampleClip(only.clip, only.progress * only.clip.duration)
    }
    if (effective === 0) {
        return {jointPoses: new Map(), boneRolls: new Map()}
    }

    const joints = new Map<string, JointAccumulator>()
    const rolls = new Map<string, RollAccumulator>()

    for (const layer of layers) {
        if (layer.weight <= 0) continue
        const sampled = sampleClip(layer.clip, layer.progress * layer.clip.duration)
        for (const [jointId, pose] of sampled.jointPoses) {
            const accumulator = joints.get(jointId)
            if (accumulator === undefined) {
                joints.set(jointId, {
                    rotation: pose.rotation.clone(),
                    position: pose.position.clone(),
                    weight: layer.weight,
                })
                continue
            }
            /* 增量归一化加权：t = 本层权重 / 累计权重 */
            const total = accumulator.weight + layer.weight
            const t = layer.weight / total
            accumulator.rotation.slerp(pose.rotation, t)
            accumulator.position.lerp(pose.position, t)
            accumulator.weight = total
        }
        for (const [boneId, roll] of sampled.boneRolls) {
            const accumulator = rolls.get(boneId)
            if (accumulator === undefined) {
                rolls.set(boneId, {roll, weight: layer.weight})
                continue
            }
            const total = accumulator.weight + layer.weight
            accumulator.roll += (roll - accumulator.roll) * (layer.weight / total)
            accumulator.weight = total
        }
    }

    const jointPoses = new Map<string, JointPose>()
    for (const [jointId, accumulator] of joints) {
        jointPoses.set(jointId, {position: accumulator.position, rotation: accumulator.rotation})
    }
    const boneRolls = new Map<string, number>()
    for (const [boneId, accumulator] of rolls) {
        boneRolls.set(boneId, accumulator.roll)
    }
    return {jointPoses, boneRolls}
}

/**
 * 组合多个 pose 层并应用到骨架（`applyPose` 的组合入口）。
 * 未被任何层覆盖的关节保留骨架当前姿态 —— 这是「上半身姿态 + 下半身步态」任意拼装的基础。
 */
export const applyComposedPose = (skeleton: Skeleton, layers: readonly PoseLayer[]): void => {
    skeleton.applyPose(composePoses(layers))
}
