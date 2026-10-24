import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import type {AnimationContext} from '../../../appearance/types.ts'
import type {BaseClipState} from '../../../../../character/state_machine/types.ts'
import {DEFAULT_HANDEDNESS} from '../../../../../character/handedness.ts'
import {segmentTotalDuration} from '../../../../../character/weapon/attack_chain.ts'
import {bakeProgressPreviewClip} from '../../common/skeleton_animation/preview.ts'
import {evaluateProgressComposition} from '../../common/skeleton_animation/progress_composition.ts'
import type {FormClipVariant, FormPreviewRequest} from '../../common/skeleton_animation/form_animation.ts'
import {BASE_CLIP_META} from './pose_fns.ts'
import {buildCharacterSkeletonDefinition} from '../skeleton/skeleton.ts'
import {resolveHumanoidFrame} from './progress_graph.ts'

const contextOf = (request: FormPreviewRequest, duration: number): AnimationContext => {
    const variant: FormClipVariant = request.variant
    return {
        stateTime: 0,
        stateDuration: duration,
        horizontalSpeed: variant.horizontalSpeed,
        attackSegment: request.kind === 'attack' ? request.segment : undefined,
        attackPhase: undefined,
        attackPhaseProgress: 0,
        attackTotalProgress: 0,
        attackPhaseIndex: 0,
        attackCharge: 0,
        attackHolding: false,
        weaponHeld: variant.weaponHeld,
        humanoid: {
            holdMode: variant.holdMode ?? 'one_handed',
            handedness: variant.handedness ?? DEFAULT_HANDEDNESS,
            ...(variant.weaponClassId !== undefined ? {weaponClassId: variant.weaponClassId} : {}),
            shieldHands: variant.shieldHands ?? {main: false, off: false},
        },
    }
}

/** 骨骼编辑器预览：直接采样生产进度组合树（含支撑手 / 盾臂 / 转向瞄准层） */
export const previewHumanoidClip = (request: FormPreviewRequest): BoneAnimationClip => {
    const isAttack = request.kind === 'attack'
    const state: BaseClipState | 'attacking' = isAttack ? 'attacking' : request.state
    const duration = isAttack
        ? segmentTotalDuration(request.segment)
        : BASE_CLIP_META[request.state].duration
    const loop = isAttack ? false : BASE_CLIP_META[request.state].loop
    const baseContext = contextOf(request, duration)
    return bakeProgressPreviewClip({
        name: `preview:humanoid:${isAttack ? request.segment.id : state}`,
        duration,
        loop,
        skeleton: buildCharacterSkeletonDefinition(),
        frameAt: progress => {
            const context: AnimationContext = {
                ...baseContext,
                stateTime: progress * duration,
                attackTotalProgress: progress,
            }
            const frame = resolveHumanoidFrame(state, context)
            return {
                pose: evaluateProgressComposition(frame.graph, frame.progress, {
                    restPose: frame.restPose,
                    params: frame.params,
                }),
                events: frame.events,
            }
        },
    })
}
