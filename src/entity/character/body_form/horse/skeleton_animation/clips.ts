import type {BaseClipState} from '../../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import {bakePoseClip} from '../../common/creature_runtime/pose.ts'
import {hitWindowRatios} from '../../common/creature_runtime/timing.ts'
import {bakeSingleAnimation, createAnimationModule, poseAnimationFactory} from '../../common/skeleton_animation/factory.ts'
import {compileAuthoredAttackClip} from '../../common/skeleton_animation/authored_attack.ts'
import {ATTACK_CLIPS} from './attack_clips/index.ts'
import {HORSE_STATE} from '../state/form_state.ts'
import {buildHorseSkeleton} from '../skeleton/skeleton.ts'
import {horseAttackPose, horsePose} from './pose_fns.ts'

const SKELETON = buildHorseSkeleton()

/** 口部挂点由 `equipWeapon` 的挂点旋转决定武器朝向，不参与动作轨道 */
export const HORSE_PRESERVED_JOINTS = ['mouthMount'] as const

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

/** 给攻击 clip 追加命中窗口事件轨（作者已声明事件时保留原事件） */
const withHitboxEvents = (clip: BoneAnimationClip, segment: AttackSegment): BoneAnimationClip => {
    if (segment.attackWeaponId !== undefined) return clip
    if (clip.eventTracks.some(track => track.records.length > 0)) return clip
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

/** 马攻击 clip：作者数据优先，缺失时回退公式烘焙（按段 id 缓存） */
export const horseAttackClip = (segment: AttackSegment): BoneAnimationClip => {
    const cached = attackCache.get(segment.id)
    if (cached !== undefined) return cached
    const authored = ATTACK_CLIPS[segment.poseId]
    const base = authored === undefined
        ? bakePoseClip(
            `horse_attack_${segment.id}`,
            Math.max(0.2, segment.duration + segment.recovery),
            false,
            SKELETON,
            horseAttackPose(segment),
            HORSE_PRESERVED_JOINTS,
        )
        : compileAuthoredAttackClip(`horse_attack_${segment.id}`, authored, SKELETON)
    const clip = withHitboxEvents(base, segment)
    attackCache.set(segment.id, clip)
    return clip
}
