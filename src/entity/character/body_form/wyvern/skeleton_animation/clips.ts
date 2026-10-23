import type {BaseClipState} from '../../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import {bakePoseClip} from '../../common/creature_runtime/pose.ts'
import {hitWindowRatios} from '../../common/creature_runtime/timing.ts'
import {bakeSingleAnimation, createAnimationModule, poseAnimationFactory} from '../../common/skeleton_animation/factory.ts'
import {WYVERN_STATE} from '../state/form_state.ts'
import {buildWyvernSkeleton} from '../skeleton/skeleton.ts'
import {wyvernAttackPose, wyvernPose} from './pose_fns.ts'

const SKELETON = buildWyvernSkeleton()

const STATE_META = WYVERN_STATE.animation

const stateCache = new Map<string, BoneAnimationClip>()
export const wyvernBaseClip = (state: BaseClipState): BoneAnimationClip => {
    const cached = stateCache.get(state)
    if (cached !== undefined) return cached
    const meta = STATE_META[state]
    const animation = poseAnimationFactory.create({
        id: `wyvern_${state}`,
        duration: meta.duration,
        loop: meta.loop,
        pose: wyvernPose(state),
    })
    const module = createAnimationModule(`wyvern:base:${state}`, 'body_form.wyvern', [animation])
    const clip = bakeSingleAnimation(SKELETON, module, animation.id)
    stateCache.set(state, clip)
    return clip
}

const withHitboxEvents = (clip: BoneAnimationClip, segment: AttackSegment): BoneAnimationClip => {
    if (segment.attackWeaponId !== undefined) return clip
    const {on, off} = hitWindowRatios(segment)
    return {
        ...clip,
        eventTracks: [{records: [
            {time: clip.duration * on, eventName: 'hitbox_on'},
            {time: clip.duration * off, eventName: 'hitbox_off'},
        ]}],
    }
}

const attackCache = new Map<string, BoneAnimationClip>()
export const wyvernAttackClip = (segment: AttackSegment): BoneAnimationClip => {
    const cached = attackCache.get(segment.id)
    if (cached !== undefined) return cached
    const duration = Math.max(0.2, segment.duration + segment.recovery)
    const base = bakePoseClip(`wyvern_attack_${segment.id}`, duration, false, SKELETON, wyvernAttackPose(segment))
    const clip = withHitboxEvents(base, segment)
    attackCache.set(segment.id, clip)
    return clip
}
