import type {CharacterState} from '../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {bakePoseClip} from '../creature_runtime/pose.ts'
import {buildWyvernSkeleton} from './skeleton.ts'
import {wyvernAttackPose, wyvernPose} from './pose_fns.ts'

const SKELETON = buildWyvernSkeleton()

const STATE_META: Partial<Record<CharacterState, {duration: number; loop: boolean}>> = {
    idle: {duration: 1.8, loop: true},
    walking: {duration: 0.8, loop: true},
    jumping: {duration: 0.4, loop: false},
    falling: {duration: 0.5, loop: true},
    swimming: {duration: 1.0, loop: true},
    floating: {duration: 1.0, loop: true},
    dying: {duration: 0.5, loop: false},
    rolling: {duration: 0.55, loop: false},
    flinching: {duration: 0.2, loop: false},
    knockdown: {duration: 0.45, loop: false},
    getting_up: {duration: 0.6, loop: false},
    blocking: {duration: 1.8, loop: true},
    guard_broken: {duration: 0.3, loop: false},
    interacting: {duration: 1.8, loop: true},
}
const DEFAULT_META = {duration: 1.4, loop: true}

const stateCache = new Map<string, BoneAnimationClip>()
export const wyvernBaseClip = (state: CharacterState): BoneAnimationClip => {
    const cached = stateCache.get(state)
    if (cached !== undefined) return cached
    const meta = STATE_META[state] ?? DEFAULT_META
    const clip = bakePoseClip(`wyvern_${state}`, meta.duration, meta.loop, SKELETON, wyvernPose(state))
    stateCache.set(state, clip)
    return clip
}

const withHitboxEvents = (clip: BoneAnimationClip, onRatio: number, offRatio: number): BoneAnimationClip => ({
    ...clip,
    eventTracks: [{records: [
        {time: clip.duration * onRatio, eventName: 'hitbox_on'},
        {time: clip.duration * offRatio, eventName: 'hitbox_off'},
    ]}],
})

const attackCache = new Map<string, BoneAnimationClip>()
export const wyvernAttackClip = (segment: AttackSegment): BoneAnimationClip => {
    /* 以段 id 缓存：claw 与 breath 的 key 同为 'light'，用 key 会互相覆盖 */
    const cached = attackCache.get(segment.id)
    if (cached !== undefined) return cached
    const duration = Math.max(0.2, segment.duration + segment.recovery)
    const base = bakePoseClip(`wyvern_attack_${segment.id}`, duration, false, SKELETON, wyvernAttackPose(segment))
    /* 远程吐息无近战命中窗口，但事件轨无害（近战执行器仅近战武器消费） */
    const clip = withHitboxEvents(base, 0.4, 0.9)
    attackCache.set(segment.id, clip)
    return clip
}
