import {Euler} from 'three'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import {sampleClip} from '../../../../../skeleton/anim/sampling.ts'
import type {JointEulers, JointPose} from '../creature_runtime/pose.ts'
import type {ProgressAnimationEvent, ProgressAnimationLeaf} from './progress_composition.ts'

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

export interface ProgressClipLeafOptions {
    /** 限制叶子覆盖的关节；缺省 = clip 全部 jointTracks */
    readonly joints?: readonly string[]
}

/**
 * 烘焙 clip → 进度式叶子。
 * clip 的秒时长只在叶子内部换算为采样时间；对外只暴露 progress。
 */
export const createProgressClipLeaf = (
    id: string,
    clip: BoneAnimationClip,
    options: ProgressClipLeafOptions = {},
): ProgressAnimationLeaf => {
    const jointFilter = options.joints === undefined ? undefined : new Set(options.joints)
    const joints = options.joints ?? clip.jointTracks.map(track => track.targetId)
    const events: ProgressAnimationEvent[] = clip.eventTracks
        .flatMap(track => track.records)
        .map(record => ({
            progress: clip.duration > 0 ? clamp01(record.time / clip.duration) : 0,
            eventName: record.eventName,
            ...(record.params !== undefined ? {params: record.params} : {}),
        }))
        .sort((a, b) => a.progress - b.progress)

    const sample = (progress: number): JointEulers => {
        const pose = sampleClip(clip, clamp01(progress) * clip.duration)
        const out: Record<string, JointPose> = {}
        for (const [jointId, jointPose] of pose.jointPoses) {
            if (jointFilter !== undefined && !jointFilter.has(jointId)) continue
            const euler = new Euler().setFromQuaternion(jointPose.rotation, 'XYZ')
            out[jointId] = {
                rotation: [euler.x, euler.y, euler.z],
                position: [jointPose.position.x, jointPose.position.y, jointPose.position.z],
            }
        }
        return out
    }

    return {
        id,
        joints,
        sample,
        ...(events.length > 0 ? {events} : {}),
    }
}
