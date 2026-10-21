import type {CharacterState} from '../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {bakePoseClip} from '../creature_runtime/pose.ts'
import {hitWindowRatios} from '../creature_runtime/timing.ts'
import {buildWolfSkeleton} from './skeleton.ts'
import {wolfAttackPose, wolfPose} from './pose_fns.ts'

const SKELETON = buildWolfSkeleton()

/** 口部挂点由 `equipWeapon` 的挂点旋转决定武器朝向，不参与动作轨道 */
const PRESERVED_JOINTS = ['mouthMount'] as const

/** 各状态时长 / 是否循环（未列出 = 默认 1.2s 循环） */
const STATE_META: Partial<Record<CharacterState, {duration: number; loop: boolean}>> = {
    idle: {duration: 1.8, loop: true},
    walking: {duration: 0.7, loop: true},
    jumping: {duration: 0.35, loop: false},
    falling: {duration: 0.45, loop: true},
    swimming: {duration: 0.9, loop: true},
    floating: {duration: 1.6, loop: true},
    dying: {duration: 0.5, loop: false},
    rolling: {duration: 0.5, loop: false},
    flinching: {duration: 0.22, loop: false},
    knockdown: {duration: 0.4, loop: false},
    getting_up: {duration: 0.5, loop: false},
    blocking: {duration: 1.6, loop: true},
    guard_broken: {duration: 0.3, loop: false},
    interacting: {duration: 1.4, loop: true},
}
const DEFAULT_META = {duration: 1.2, loop: true}

const stateCache = new Map<string, BoneAnimationClip>()

/** 狼基础状态 clip（按状态惰性烘焙并缓存） */
export const wolfBaseClip = (state: CharacterState): BoneAnimationClip => {
    const cached = stateCache.get(state)
    if (cached !== undefined) return cached
    const meta = STATE_META[state] ?? DEFAULT_META
    const clip = bakePoseClip(`wolf_${state}`, meta.duration, meta.loop, SKELETON, wolfPose(state), PRESERVED_JOINTS)
    stateCache.set(state, clip)
    return clip
}

/** 给攻击 clip 追加命中窗口事件轨（按段相位推导，不再写死 0.35/0.9） */
const withHitboxEvents = (clip: BoneAnimationClip, segment: AttackSegment): BoneAnimationClip => {
    if (segment.attackWeaponId !== undefined) return clip
    const {on, off} = hitWindowRatios(segment)
    return {
        ...clip,
        eventTracks: [{
            records: [
                {time: clip.duration * on, eventName: 'hitbox_on'},
                {time: clip.duration * off, eventName: 'hitbox_off'},
            ],
        }],
    }
}

const attackCache = new Map<string, BoneAnimationClip>()

/** 狼攻击 clip（按段 id 缓存：撕咬与口含剑互不覆盖） */
export const wolfAttackClip = (segment: AttackSegment): BoneAnimationClip => {
    const cached = attackCache.get(segment.id)
    if (cached !== undefined) return cached
    const duration = Math.max(0.2, segment.duration + segment.recovery)
    const base = bakePoseClip(`wolf_attack_${segment.id}`, duration, false, SKELETON, wolfAttackPose(segment), PRESERVED_JOINTS)
    const clip = withHitboxEvents(base, segment)
    attackCache.set(segment.id, clip)
    return clip
}
