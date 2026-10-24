import type {BoneEventRecord} from '../../../../../skeleton/anim/types.ts'
import {isAttackState} from '../../../../../character/state_machine/types.ts'
import type {AppearanceSystem, AppearanceSystemOptions, CreatureModel} from '../../../appearance/types.ts'
import {createCharacterSkeletonBridge} from '../../../appearance/skeleton_bridge.ts'
import {applyJointBlend, snapshotJoints, type JointSnapshot} from '../../../appearance/joint_blend.ts'
import {STATE_BLEND_DURATION} from '../../../appearance/constants.ts'
import type {SkeletonSceneBridge} from '../../../../skeleton/render/bridge.ts'
import {jointEulersToSkeletonPose} from '../../common/skeleton_animation/progress_pose.ts'
import {evaluateProgressComposition, type ProgressAnimationEvent} from '../../common/skeleton_animation/progress_composition.ts'
import {resolveHumanoidFrame} from './progress_graph.ts'
import {buildCharacterSkeletonDefinition} from '../skeleton/skeleton.ts'

const eventRecordOf = (event: ProgressAnimationEvent): BoneEventRecord => ({
    time: event.progress,
    eventName: event.eventName,
    ...(event.params !== undefined ? {params: event.params} : {}),
})

const fireRange = (
    from: number,
    to: number,
    events: readonly ProgressAnimationEvent[],
    onEvent: ((record: BoneEventRecord) => void) | undefined,
): void => {
    if (onEvent === undefined) return
    if (to >= from) {
        for (const event of events) {
            if (event.progress > from && event.progress <= to) onEvent(eventRecordOf(event))
        }
        return
    }
    for (const event of events) {
        if (event.progress > from || event.progress <= to) onEvent(eventRecordOf(event))
    }
}

/** 人形进度式动画系统：每物理步求值单一组合树，不再使用 clip player */
export const createHumanoidProgressSystem = (options?: AppearanceSystemOptions): AppearanceSystem => {
    let bridge: SkeletonSceneBridge | undefined
    let currentModel: CreatureModel | undefined
    let currentKey: string | undefined
    let blendFrom: readonly JointSnapshot[] | null = null
    let blendT = 0
    let lastProgress = 0
    let lastHolding = false

    return {
        update: (dt, model, state, ctx): void => {
            if (bridge === undefined || currentModel !== model) {
                bridge = createCharacterSkeletonBridge(model, buildCharacterSkeletonDefinition())
                currentModel = model
                currentKey = undefined
                blendFrom = null
            }
            const frame = resolveHumanoidFrame(state, ctx)
            if (frame.key !== currentKey) {
                blendFrom = currentKey === undefined ? null : snapshotJoints(model)
                blendT = 0
                currentKey = frame.key
                lastProgress = frame.progress
                lastHolding = ctx.attackHolding
                if (isAttackState(state)) options?.onAttackEvent?.({time: 0, eventName: 'hitbox_off'})
            } else {
                if (ctx.attackHolding !== lastHolding) {
                    lastProgress = frame.progress
                } else {
                    fireRange(lastProgress, frame.progress, frame.events, options?.onAttackEvent)
                }
                lastProgress = frame.progress
                lastHolding = ctx.attackHolding
            }
            const pose = evaluateProgressComposition(frame.graph, frame.progress, {
                restPose: frame.restPose,
                params: frame.params,
            })
            bridge.applyPose(jointEulersToSkeletonPose(pose, bridge))
            if (blendFrom !== null) {
                blendT = applyJointBlend(blendFrom, blendT, dt, STATE_BLEND_DURATION)
                if (blendT >= STATE_BLEND_DURATION) blendFrom = null
            }
            model.updateDeform?.()
        },
    }
}
