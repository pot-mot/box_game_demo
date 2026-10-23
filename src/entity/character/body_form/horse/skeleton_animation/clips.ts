import type {BaseClipState} from '../../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import {bakePoseClip} from '../../common/creature_runtime/pose.ts'
import {hitWindowRatios} from '../../common/creature_runtime/timing.ts'
import {bakeSingleAnimation, createAnimationModule, poseAnimationFactory} from '../../common/skeleton_animation/factory.ts'
import {HORSE_STATE} from '../state/form_state.ts'
import {buildHorseSkeleton} from '../skeleton/skeleton.ts'
import {horseAttackPose, horsePose} from './pose_fns.ts'

const SKELETON = buildHorseSkeleton()

const STATE_META = HORSE_STATE.animation

const stateCache = new Map<string, BoneAnimationClip>()
export const horseBaseClip = (state: BaseClipState): BoneAnimationClip => {
    const cached = stateCache.get(state)
    if (cached !== undefined) return cached
    const meta = STATE_META[state]
    const animation = poseAnimationFactory.create({
        id: `horse_${state}`,
        duration: meta.duration,
        loop: meta.loop,
        pose: horsePose(state),
    })
    const module = createAnimationModule(`horse:base:${state}`, 'body_form.horse', [animation])
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
export const horseAttackClip = (segment: AttackSegment): BoneAnimationClip => {
    const cached = attackCache.get(segment.id)
    if (cached !== undefined) return cached
    const duration = Math.max(0.2, segment.duration + segment.recovery)
    const base = bakePoseClip(`horse_attack_${segment.id}`, duration, false, SKELETON, horseAttackPose(segment))
    const clip = withHitboxEvents(base, segment)
    attackCache.set(segment.id, clip)
    return clip
}
