import type {CharacterState} from '../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {bakePoseClip} from '../creature_runtime/pose.ts'
import {buildWolfSkeleton} from './skeleton.ts'
import {wolfAttackPose, wolfPose} from './pose_fns.ts'

const SKELETON = buildWolfSkeleton()

/** 各状态时长 / 是否循环（未列出 = 默认 1.2s 循环） */
const STATE_META: Partial<Record<CharacterState, {duration: number; loop: boolean}>> = {
    idle: {duration: 1.6, loop: true},
    walking: {duration: 0.7, loop: true},
    jumping: {duration: 0.35, loop: false},
    falling: {duration: 0.4, loop: true},
    swimming: {duration: 0.9, loop: true},
    floating: {duration: 1.6, loop: true},
    dying: {duration: 0.4, loop: false},
    rolling: {duration: 0.5, loop: false},
    flinching: {duration: 0.2, loop: false},
    knockdown: {duration: 0.4, loop: false},
    getting_up: {duration: 0.5, loop: false},
    blocking: {duration: 1.2, loop: true},
    guard_broken: {duration: 0.3, loop: false},
    interacting: {duration: 1.2, loop: true},
}
const DEFAULT_META = {duration: 1.2, loop: true}

const stateCache = new Map<string, BoneAnimationClip>()

/** 狼基础状态 clip（按状态惰性烘焙并缓存） */
export const wolfBaseClip = (state: CharacterState): BoneAnimationClip => {
    const cached = stateCache.get(state)
    if (cached !== undefined) return cached
    const meta = STATE_META[state] ?? DEFAULT_META
    const clip = bakePoseClip(`wolf_${state}`, meta.duration, meta.loop, SKELETON, wolfPose(state))
    stateCache.set(state, clip)
    return clip
}

/** 给攻击 clip 追加命中窗口事件轨（近战执行器据此开关判定） */
const withHitboxEvents = (clip: BoneAnimationClip, onRatio: number, offRatio: number): BoneAnimationClip => ({
    ...clip,
    eventTracks: [{
        records: [
            {time: clip.duration * onRatio, eventName: 'hitbox_on'},
            {time: clip.duration * offRatio, eventName: 'hitbox_off'},
        ],
    }],
})

const attackCache = new Map<string, BoneAnimationClip>()

/** 狼攻击 clip（按段 key：light 突进 / heavy 重咬 / air 扑击）；命中窗口由事件轨驱动 */
export const wolfAttackClip = (segment: AttackSegment): BoneAnimationClip => {
    const cached = attackCache.get(segment.key)
    if (cached !== undefined) return cached
    const duration = Math.max(0.2, segment.duration + segment.recovery)
    const base = bakePoseClip(`wolf_attack_${segment.key}`, duration, false, SKELETON, wolfAttackPose(segment.key))
    const clip = withHitboxEvents(base, 0.35, 0.9)
    attackCache.set(segment.key, clip)
    return clip
}
