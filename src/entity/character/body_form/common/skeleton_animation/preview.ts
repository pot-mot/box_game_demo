import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'
import {bakePoseClip} from '../creature_runtime/pose.ts'
import type {JointEulers} from '../creature_runtime/pose.ts'
import type {ProgressAnimationEvent} from './progress_composition.ts'

/** 预览帧：完整关节姿态 + 该进度上的事件（攻击段） */
export interface PreviewFrame {
    readonly pose: JointEulers
    readonly events?: readonly ProgressAnimationEvent[]
}

export interface ProgressPreviewOptions {
    readonly name: string
    readonly duration: number
    readonly loop: boolean
    readonly skeleton: SkeletonDefinition
    readonly frameAt: (progress: number) => PreviewFrame
    readonly preserveJointIds?: readonly string[]
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * 由进度式组合烘焙编辑器预览 clip。
 * 只用于骨骼编辑器动作库；生产运行时仍按进度逐帧求值，不经过本函数。
 */
export const bakeProgressPreviewClip = (options: ProgressPreviewOptions): BoneAnimationClip => {
    const first = options.frameAt(0)
    const clip = bakePoseClip(
        options.name,
        options.duration,
        options.loop,
        options.skeleton,
        t => options.frameAt(clamp01(t / options.duration)).pose,
        options.preserveJointIds,
    )
    const events = first.events ?? []
    if (events.length === 0) return clip
    return {
        ...clip,
        eventTracks: [{
            records: events.map(event => ({
                time: clamp01(event.progress) * options.duration,
                eventName: event.eventName,
                ...(event.params !== undefined ? {params: event.params} : {}),
            })),
        }],
    }
}
