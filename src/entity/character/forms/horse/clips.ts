import type {BaseClipState} from '../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {bakePoseClip} from '../creature_runtime/pose.ts'
import {hitWindowRatios} from '../creature_runtime/timing.ts'
import {creatureStateMeta} from '../creature_runtime/state_timing.ts'
import {buildHorseSkeleton} from './skeleton.ts'
import {horseAttackPose, horsePose} from './pose_fns.ts'

const SKELETON = buildHorseSkeleton()

const STATE_META = creatureStateMeta({idle: 2.0, walking: 0.8, jumping: 0.4, falling: 0.45, swimming: 1.0, floating: 1.8})

const stateCache = new Map<string, BoneAnimationClip>()
export const horseBaseClip = (state: BaseClipState): BoneAnimationClip => {
    const cached = stateCache.get(state)
    if (cached !== undefined) return cached
    const meta = STATE_META[state]
    const clip = bakePoseClip(`horse_${state}`, meta.duration, meta.loop, SKELETON, horsePose(state))
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
