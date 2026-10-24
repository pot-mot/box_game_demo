import type {JointEulers, JointPose} from '../creature_runtime/pose.ts'
import {isPoseWithPosition} from '../creature_runtime/pose.ts'

/**
 * 进度式动画组合（P2 核心）：
 * - 组合只接受 progress，不持有时间 / 时长 / 倍速；
 * - 子组合权重在引用边，边可带每关节权重；
 * - normal 贡献按有效权重归一化加权平均；additive 在归一化之后按声明顺序叠加；
 * - 叶子可为程序化采样或烘焙 clip 的 progress 适配器。
 */

export type Progress = number

export type ProgressAnimationParamValue = number | readonly [number, number, number]
export type ProgressAnimationParams = Readonly<Record<string, ProgressAnimationParamValue>>

export interface ProgressAnimationEvent {
    /** 叶子自身 progress 空间中的阈值 */
    readonly progress: Progress
    readonly eventName: string
    readonly params?: Readonly<Record<string, string | number>>
}

export interface ProgressAnimationLeaf {
    readonly id: string
    /** 声明的控制关节；叶子内部权重恒为 1 */
    readonly joints: readonly string[]
    readonly sample: (progress: Progress, params: ProgressAnimationParams) => JointEulers
    readonly events?: readonly ProgressAnimationEvent[]
}

export type ProgressWeight = number | ((params: ProgressAnimationParams) => number)

export interface ProgressAnimationLayer {
    readonly source: ProgressAnimationSource
    /** 父 progress 区间 */
    readonly from: Progress
    readonly to: Progress
    readonly weight: ProgressWeight
    readonly jointWeights?: Readonly<Record<string, ProgressWeight>>
    readonly mode: 'normal' | 'additive'
    /** 父区间内子 progress 的循环次数；缺省 1 */
    readonly repeat?: number
    /** 直接指定子 progress（参数绑定）；提供时忽略 from/to 映射 */
    readonly progress?: Progress | ((params: ProgressAnimationParams) => Progress)
}

export interface ProgressAnimationComposition {
    readonly id: string
    readonly layers: readonly ProgressAnimationLayer[]
}

export type ProgressAnimationSource = ProgressAnimationComposition | ProgressAnimationLeaf

export interface ProgressEvaluationOptions {
    readonly restPose: JointEulers
    readonly params?: ProgressAnimationParams
}

interface WorkingPose {
    rotation: [number, number, number]
    position?: [number, number, number]
}

interface NormalAccumulator {
    rotation: [number, number, number]
    position: [number, number, number]
    hasPosition: boolean
    weight: number
    positionWeight: number
}

interface AdditiveContribution {
    readonly jointId: string
    readonly pose: WorkingPose
    readonly weight: number
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const isLeaf = (source: ProgressAnimationSource): source is ProgressAnimationLeaf => 'sample' in source

const cloneRotation = (rotation: readonly [number, number, number]): [number, number, number] =>
    [rotation[0], rotation[1], rotation[2]]

const toWorkingPose = (pose: JointPose): WorkingPose =>
    isPoseWithPosition(pose)
        ? {rotation: cloneRotation(pose.rotation), position: [pose.position[0], pose.position[1], pose.position[2]]}
        : {rotation: cloneRotation(pose)}

const resolveWeight = (weight: ProgressWeight, params: ProgressAnimationParams): number =>
    typeof weight === 'number' ? weight : weight(params)

const resolveProgress = (
    progress: Progress | ((params: ProgressAnimationParams) => Progress),
    params: ProgressAnimationParams,
): Progress => typeof progress === 'number' ? progress : progress(params)

const mergeJointWeights = (
    parent: Readonly<Record<string, number>> | undefined,
    child: Readonly<Record<string, ProgressWeight>> | undefined,
    params: ProgressAnimationParams,
): Readonly<Record<string, number>> | undefined => {
    if (child === undefined) return parent
    const merged: Record<string, number> = {...(parent ?? {})}
    for (const [jointId, weight] of Object.entries(child)) {
        merged[jointId] = (merged[jointId] ?? 1) * resolveWeight(weight, params)
    }
    return merged
}

const isLayerActive = (layer: ProgressAnimationLayer, progress: Progress): boolean => {
    if (layer.from >= layer.to) return false
    if (progress < layer.from) return false
    return progress < layer.to || (layer.to >= 1 && progress <= 1)
}

/** 父 progress → 子 progress；repeat 只在 progress 空间内重复，不引入时间/倍速 */
const mapProgress = (layer: ProgressAnimationLayer, progress: Progress): Progress => {
    const span = layer.to - layer.from
    if (span <= 0) return 0
    const local = (progress - layer.from) / span
    const repeat = layer.repeat ?? 1
    if (!Number.isFinite(repeat) || repeat <= 0) return clamp01(local)
    const scaled = local * repeat
    if (repeat > 1 || scaled > 1 || scaled < 0) return scaled - Math.floor(scaled)
    return clamp01(scaled)
}

const addNormal = (
    acc: Map<string, NormalAccumulator>,
    jointId: string,
    pose: WorkingPose,
    weight: number,
): void => {
    const current = acc.get(jointId)
    const rotation = current?.rotation ?? [0, 0, 0]
    const position = current?.position ?? [0, 0, 0]
    const next: NormalAccumulator = current ?? {
        rotation: [0, 0, 0],
        position: [0, 0, 0],
        hasPosition: false,
        weight: 0,
        positionWeight: 0,
    }
    next.rotation[0] = rotation[0] + pose.rotation[0] * weight
    next.rotation[1] = rotation[1] + pose.rotation[1] * weight
    next.rotation[2] = rotation[2] + pose.rotation[2] * weight
    next.weight += weight
    if (pose.position !== undefined) {
        next.position[0] = position[0] + pose.position[0] * weight
        next.position[1] = position[1] + pose.position[1] * weight
        next.position[2] = position[2] + pose.position[2] * weight
        next.positionWeight += weight
        next.hasPosition = true
    }
    acc.set(jointId, next)
}

/**
 * 求值进度式组合。
 * 返回包含 rest 全部关节的完整姿态；未覆盖关节使用 rest。
 */
export const evaluateProgressComposition = (
    composition: ProgressAnimationComposition,
    progress: Progress,
    options: ProgressEvaluationOptions,
): JointEulers => {
    const params = options.params ?? {}
    const normal = new Map<string, NormalAccumulator>()
    const additive: AdditiveContribution[] = []

    const visit = (
        source: ProgressAnimationSource,
        sourceProgress: Progress,
        pathWeight: number,
        jointWeights: Readonly<Record<string, number>> | undefined,
        mode: 'normal' | 'additive',
    ): void => {
        if (isLeaf(source)) {
            const sampled = source.sample(clamp01(sourceProgress), params)
            for (const [jointId, jointPose] of Object.entries(sampled)) {
                const weight = pathWeight * (jointWeights?.[jointId] ?? 1)
                if (!(weight > 0)) continue
                const working = toWorkingPose(jointPose)
                if (mode === 'normal') addNormal(normal, jointId, working, weight)
                else additive.push({jointId, pose: working, weight})
            }
            return
        }
        for (const layer of source.layers) {
            if (!isLayerActive(layer, progress)) continue
            const childMode = mode === 'additive' || layer.mode === 'additive' ? 'additive' : 'normal'
            visit(
                layer.source,
                layer.progress === undefined ? mapProgress(layer, progress) : resolveProgress(layer.progress, params),
                pathWeight * resolveWeight(layer.weight, params),
                mergeJointWeights(jointWeights, layer.jointWeights, params),
                childMode,
            )
        }
    }

    visit(composition, progress, 1, undefined, 'normal')

    const result = new Map<string, WorkingPose>()
    for (const [jointId, acc] of normal) {
        if (!(acc.weight > 0)) continue
        result.set(jointId, {
            rotation: [acc.rotation[0] / acc.weight, acc.rotation[1] / acc.weight, acc.rotation[2] / acc.weight],
            ...(acc.hasPosition && acc.positionWeight > 0
                ? {position: [acc.position[0] / acc.positionWeight, acc.position[1] / acc.positionWeight, acc.position[2] / acc.positionWeight] as [number, number, number]}
                : {}),
        })
    }

    for (const contribution of additive) {
        const rest = options.restPose[contribution.jointId]
        const restWorking = rest === undefined ? undefined : toWorkingPose(rest)
        const current = result.get(contribution.jointId)
        const base: WorkingPose = current ?? (restWorking === undefined
            ? {rotation: [0, 0, 0]}
            : {rotation: cloneRotation(restWorking.rotation), ...(restWorking.position !== undefined ? {position: [restWorking.position[0], restWorking.position[1], restWorking.position[2]] as [number, number, number]} : {})})
        const restRotation = restWorking?.rotation ?? [0, 0, 0]
        base.rotation[0] += (contribution.pose.rotation[0] - restRotation[0]) * contribution.weight
        base.rotation[1] += (contribution.pose.rotation[1] - restRotation[1]) * contribution.weight
        base.rotation[2] += (contribution.pose.rotation[2] - restRotation[2]) * contribution.weight
        /* 只有 additive 明确提供 position 时才产生位置增量；纯旋转 additive 不得把位置拉回原点 */
        if (contribution.pose.position !== undefined) {
            const basePosition = base.position ?? restWorking?.position ?? [0, 0, 0]
            const restPosition = restWorking?.position ?? [0, 0, 0]
            const posePosition = contribution.pose.position
            base.position = [
                basePosition[0] + (posePosition[0] - restPosition[0]) * contribution.weight,
                basePosition[1] + (posePosition[1] - restPosition[1]) * contribution.weight,
                basePosition[2] + (posePosition[2] - restPosition[2]) * contribution.weight,
            ]
        }
        result.set(contribution.jointId, base)
    }

    const output: Record<string, JointPose> = {}
    const jointIds = new Set<string>([...Object.keys(options.restPose), ...result.keys()])
    for (const jointId of jointIds) {
        const pose = result.get(jointId)
        if (pose !== undefined) {
            output[jointId] = pose.position !== undefined
                ? {rotation: pose.rotation, position: pose.position}
                : pose.rotation
            continue
        }
        const rest = options.restPose[jointId]
        if (rest !== undefined) output[jointId] = rest
    }
    return output
}

/** 叶子自身 progress 区间内的事件（供运行时在跨阈值时派发） */
export const leafEventsInRange = (
    leaf: ProgressAnimationLeaf,
    fromProgress: Progress,
    toProgress: Progress,
): readonly ProgressAnimationEvent[] => {
    if (leaf.events === undefined || leaf.events.length === 0) return []
    const byProgress = (a: ProgressAnimationEvent, b: ProgressAnimationEvent): number => a.progress - b.progress
    if (toProgress >= fromProgress) {
        return leaf.events
            .filter(event => event.progress > fromProgress && event.progress <= toProgress)
            .sort(byProgress)
    }
    const tail = leaf.events.filter(event => event.progress > fromProgress).sort(byProgress)
    const head = leaf.events.filter(event => event.progress <= toProgress).sort(byProgress)
    return [...tail, ...head]
}
