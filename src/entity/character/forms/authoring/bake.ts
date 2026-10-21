import type {SkeletonDefinition} from '../../../../skeleton/anim/serialization.ts'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {bakePoseClip, type JointEulers} from '../creature_runtime/pose.ts'
import type {ScriptBakeError, ScriptBakeResult, ScriptedMotion} from './motion.ts'
import {assertFinitePose} from './pose_compose.ts'

const validateMotion = (motion: ScriptedMotion): void => {
    if (motion.id.trim().length === 0) throw new Error('动作 id 不能为空')
    if (!Number.isFinite(motion.duration) || motion.duration <= 0) {
        throw new Error(`动作 ${motion.id} 的 duration 必须为有限正数`)
    }
}

/** 语义动作 JIT 烘焙：校验每个动作并转换成骨骼页可直接播放的 clip */
export const bakeScriptedMotions = (
    formId: string,
    skeleton: SkeletonDefinition,
    motions: readonly ScriptedMotion[],
): ScriptBakeResult => {
    const jointIds = new Set(skeleton.joints.map(joint => joint.id))
    const clips = new Map<string, BoneAnimationClip>()
    const errors: ScriptBakeError[] = []

    for (const motion of motions) {
        try {
            validateMotion(motion)
            if (clips.has(motion.id)) throw new Error(`动作 id 重复：${motion.id}`)
            const pose = (t: number, total: number): JointEulers => {
                const result = motion.pose(t, total)
                for (const [jointId, jointPose] of Object.entries(result)) {
                    if (!jointIds.has(jointId)) throw new Error(`动作 ${motion.id} 引用了未知关节：${jointId}`)
                    assertFinitePose(jointPose, jointId)
                }
                return result
            }
            const clip = bakePoseClip(
                `script:${formId}:${motion.id}`,
                motion.duration,
                motion.loop,
                skeleton,
                pose,
            )
            clips.set(motion.id, clip)
        } catch (error) {
            errors.push({
                motionId: motion.id,
                message: error instanceof Error ? error.message : String(error),
            })
        }
    }

    return {clips, errors}
}
