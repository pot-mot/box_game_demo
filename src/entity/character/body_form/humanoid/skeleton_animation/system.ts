import {getBaseClipForHoldMode} from './clips/base_clips.ts'
import {getAttackClipById} from './clips/attack_clips.ts'
import {buildCharacterSkeletonDefinition} from '../skeleton/skeleton.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import {DEFAULT_HANDEDNESS} from '../../../../../character/handedness.ts'
import type {FormAnimation, FormClipVariant} from '../../common/skeleton_animation/form_animation.ts'
import {createHumanoidProgressSystem} from './progress_system.ts'

/* 编辑器 clip 预览用持盾臂集合 */
const NO_SHIELD_ARMS: readonly ('right' | 'left')[] = []
const RIGHT_SHIELD_ARM: readonly ('right' | 'left')[] = ['right']
const LEFT_SHIELD_ARM: readonly ('right' | 'left')[] = ['left']
const BOTH_SHIELD_ARMS: readonly ('right' | 'left')[] = ['right', 'left']

const shieldArmsOf = (shieldHands: Readonly<{main: boolean; off: boolean}>): readonly ('right' | 'left')[] => {
    if (shieldHands.main) return shieldHands.off ? BOTH_SHIELD_ARMS : RIGHT_SHIELD_ARM
    return shieldHands.off ? LEFT_SHIELD_ARM : NO_SHIELD_ARMS
}

/** 编辑器预览：整身基础 clip（运行时使用 progress_graph 组合树） */
const baseClipOf = (state: Parameters<typeof getBaseClipForHoldMode>[0], variant: FormClipVariant): BoneAnimationClip =>
    getBaseClipForHoldMode(
        state,
        variant.weaponHeld,
        variant.holdMode ?? 'one_handed',
        variant.horizontalSpeed,
        shieldArmsOf(variant.shieldHands ?? {main: false, off: false}),
        variant.handedness ?? DEFAULT_HANDEDNESS,
        variant.weaponClassId,
    )

/** 编辑器预览：整身攻击 clip（含支撑手） */
const attackClipOf = (segment: AttackSegment, variant: FormClipVariant): BoneAnimationClip =>
    getAttackClipById(segment.poseId, variant.handedness ?? DEFAULT_HANDEDNESS)

/** 人形动画定义：运行时走进度组合树；baseClip/attackClip 仅服务骨骼编辑器。 */
export const HUMANOID_ANIMATION: FormAnimation = {
    skeleton: buildCharacterSkeletonDefinition,
    baseClip: baseClipOf,
    attackClip: attackClipOf,
    weaponVariants: true,
    createSystem: options => createHumanoidProgressSystem(options),
}
