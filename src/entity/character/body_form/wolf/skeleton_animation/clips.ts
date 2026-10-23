import type {BaseClipState} from '../../../../../character/state_machine/types.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import {bakePoseClip} from '../../common/creature_runtime/pose.ts'
import {hitWindowRatios} from '../../common/creature_runtime/timing.ts'
import {bakeSingleAnimation, createAnimationModule, poseAnimationFactory} from '../../common/skeleton_animation/factory.ts'
import {WOLF_STATE} from '../state/form_state.ts'
import {buildWolfSkeleton} from '../skeleton/skeleton.ts'
import {wolfAttackPose, wolfPose} from './pose_fns.ts'

const SKELETON = buildWolfSkeleton()

/** 口部挂点由 `equipWeapon` 的挂点旋转决定武器朝向，不参与动作轨道 */
const PRESERVED_JOINTS = ['mouthMount'] as const

const STATE_META = WOLF_STATE.animation

const stateCache = new Map<string, BoneAnimationClip>()

/** 狼基础状态 clip（按状态惰性烘焙并缓存） */
export const wolfBaseClip = (state: BaseClipState): BoneAnimationClip => {
    const cached = stateCache.get(state)
    if (cached !== undefined) return cached
    const meta = STATE_META[state]
    const animation = poseAnimationFactory.create({
        id: `wolf_${state}`,
        duration: meta.duration,
        loop: meta.loop,
        pose: wolfPose(state),
    })
    const module = createAnimationModule(`wolf:base:${state}`, 'body_form.wolf', [animation])
    const clip = bakeSingleAnimation(SKELETON, module, animation.id)
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
