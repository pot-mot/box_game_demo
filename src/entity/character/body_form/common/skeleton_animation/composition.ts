import type {StringLocaleKey} from '../../../../../i18n/index.ts'
import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import {bakePoseClip} from '../creature_runtime/pose.ts'
import type {JointEulers, JointPose} from '../creature_runtime/pose.ts'
import {isPoseWithPosition} from '../creature_runtime/pose.ts'

/**
 * 骨骼动画组合模型（跨体形通用）：
 *
 * - `SkeletonAnimation`：百分比时间轴上的关节姿态，只改关节数据，不增删骨架节点；
 * - `AnimationFactory`：固定参数类型 / 种类 / 数量的同型动画工厂；
 * - `AnimationComposition`：多个动画 / 组合按 0-1 权重与起止时间叠加，可再组合；
 * - `AnimationModule`：一组动画与组合（表示一组动作）；
 * - `bakeAnimationModule`：烘焙为运行时 clip，播放期零组合计算。
 *
 * 组合只影响关节数据；骨架节点集合 / 父级 / IK 配置由 `SkeletonDefinition` 唯一决定。
 */

export interface SkeletonAnimation {
    /** 体形内稳定 id（缓存键 / 编辑器动作库键） */
    readonly id: string
    /** 时长（秒） */
    readonly duration: number
    readonly loop: boolean
    /** 采样：progress ∈ [0, 1]，返回关节姿态（未列出的关节保持骨架静止姿态） */
    readonly sample: (progress: number) => JointEulers
}

export interface AnimationFactory<TParams> {
    /** 固定参数类型的同型动画工厂（参数种类与数量由工厂定义） */
    readonly create: (params: TParams) => SkeletonAnimation
}

export type AnimationSource = SkeletonAnimation | AnimationComposition

/** 组合中的一层：source 在 [start, end) 内按 weight 叠加（时间以所属组合为基准，秒） */
export interface AnimationLayer {
    readonly source: AnimationSource
    readonly weight: number
    readonly start: number
    readonly end: number
}

export interface AnimationComposition {
    readonly id: string
    readonly duration: number
    readonly layers: readonly AnimationLayer[]
}

export interface AnimationModule {
    readonly id: string
    readonly nameKey: StringLocaleKey
    readonly animations: readonly SkeletonAnimation[]
    readonly compositions: readonly AnimationComposition[]
}

const clampProgress = (value: number): number => Math.min(1, Math.max(0, value))

const sampleSource = (source: AnimationSource, time: number): JointEulers => {
    if ('layers' in source) return sampleComposition(source, time)
    return source.sample(clampProgress(source.duration <= 0 ? 0 : time / source.duration))
}

/**
 * 采样动画组合：每个关节对**声明了该关节**的层做权重归一化平均；
 * 位置同样按权重平均；未被任何层声明的关节保持骨架静止姿态。
 */
export const sampleComposition = (composition: AnimationComposition, time: number): JointEulers => {
    const rotations = new Map<string, [number, number, number]>()
    const positions = new Map<string, [number, number, number]>()
    const weights = new Map<string, number>()
    const order: string[] = []

    for (const layer of composition.layers) {
        if (layer.weight <= 0 || time < layer.start || time >= layer.end) continue
        const span = layer.end - layer.start
        if (span <= 0) continue
        const local = (time - layer.start) / span
        const pose = sampleSource(layer.source, local * layer.source.duration)
        for (const [jointId, jointPose] of Object.entries(pose)) {
            const rotation = isPoseWithPosition(jointPose) ? jointPose.rotation : jointPose
            const current = rotations.get(jointId)
            if (current === undefined) {
                order.push(jointId)
                rotations.set(jointId, [rotation[0] * layer.weight, rotation[1] * layer.weight, rotation[2] * layer.weight])
            } else {
                current[0] += rotation[0] * layer.weight
                current[1] += rotation[1] * layer.weight
                current[2] += rotation[2] * layer.weight
            }
            weights.set(jointId, (weights.get(jointId) ?? 0) + layer.weight)
            if (isPoseWithPosition(jointPose)) {
                const p = jointPose.position
                const pos = positions.get(jointId)
                if (pos === undefined) positions.set(jointId, [p[0] * layer.weight, p[1] * layer.weight, p[2] * layer.weight])
                else {
                    pos[0] += p[0] * layer.weight
                    pos[1] += p[1] * layer.weight
                    pos[2] += p[2] * layer.weight
                }
            }
        }
    }

    const merged: Record<string, JointPose> = {}
    for (const jointId of order) {
        const weight = weights.get(jointId) ?? 0
        const rotation = rotations.get(jointId)
        if (rotation === undefined || weight <= 0) continue
        const normalized: [number, number, number] = [rotation[0] / weight, rotation[1] / weight, rotation[2] / weight]
        const position = positions.get(jointId)
        merged[jointId] = position === undefined
            ? normalized
            : {rotation: normalized, position: [position[0] / weight, position[1] / weight, position[2] / weight]}
    }
    return merged
}

/**
 * 扁平化组合（组合再组合 → 单层列表）：
 * 嵌套组合的时间范围映射到父组合时间轴，权重相乘；返回可直接采样的等价组合。
 */
export const flattenComposition = (composition: AnimationComposition): AnimationComposition => {
    const layers: AnimationLayer[] = []
    const visit = (source: AnimationSource, start: number, end: number, weight: number): void => {
        if (!('layers' in source)) {
            layers.push({source, weight, start, end})
            return
        }
        const parentSpan = end - start
        const childDuration = source.duration <= 0 ? 1 : source.duration
        for (const child of source.layers) {
            const mappedStart = start + child.start * parentSpan / childDuration
            const mappedEnd = start + child.end * parentSpan / childDuration
            if (mappedEnd <= mappedStart) continue
            visit(child.source, mappedStart, mappedEnd, weight * child.weight)
        }
    }
    for (const layer of composition.layers) visit(layer.source, layer.start, layer.end, layer.weight)
    return {id: composition.id, duration: composition.duration, layers}
}

/** 运行时 / 烘焙缓存键：只由骨架签名 + 动画模组版本决定，装备变化不会导致重烘 */
export const animationModuleCacheKey = (skeletonSignature: string, moduleVersion: string): string =>
    `${skeletonSignature}|${moduleVersion}`

/**
 * 烘焙动画模组：逐动画 / 组合采样并生成运行时 clip。
 * 只允许引用骨架已有节点；引用未知节点直接 fail loudly（动画不能增删骨骼）。
 */
export const bakeAnimationModule = (
    skeleton: SkeletonDefinition,
    module: AnimationModule,
    fps: number,
    moduleVersion = '1',
): ReadonlyMap<string, BoneAnimationClip> => {
    const jointIds = new Set(skeleton.joints.map(joint => joint.id))
    const validate = (id: string, pose: JointEulers): JointEulers => {
        for (const jointId of Object.keys(pose)) {
            if (!jointIds.has(jointId)) throw new Error(`动画 ${module.id}/${id} 引用了骨架不存在的关节 ${jointId}`)
        }
        return pose
    }
    const clips = new Map<string, BoneAnimationClip>()
    for (const animation of module.animations) {
        clips.set(animation.id, bakePoseClip(
            `${module.id}:${animation.id}:${moduleVersion}`,
            animation.duration,
            animation.loop,
            skeleton,
            (t, total) => validate(animation.id, animation.sample(clampProgress(total <= 0 ? 0 : t / total))),
            [],
            fps,
        ))
    }
    for (const composition of module.compositions) {
        clips.set(composition.id, bakePoseClip(
            `${module.id}:${composition.id}:${moduleVersion}`,
            composition.duration,
            false,
            skeleton,
            (t) => validate(composition.id, sampleComposition(composition, t)),
            [],
            fps,
        ))
    }
    return clips
}
