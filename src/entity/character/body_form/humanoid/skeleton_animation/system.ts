import {isAttackState, type CharacterState} from '../../../../../character/state_machine/types.ts'
import type {AnimationContext} from '../../../appearance/types.ts'
import {getBaseClipForHoldMode, getWalkLegsClip, fallingSpeedTier, WALK_LEG_JOINTS} from './clips/base_clips.ts'
import {
    jointEulersToSkeletonPose,
    sampleComposition,
    type AnimationComposition,
} from '../../common/skeleton_animation/composition.ts'
import {getAttackClipById} from './clips/attack_clips.ts'
import {buildCharacterSkeletonDefinition} from '../skeleton/skeleton.ts'
import {skeletonFromDefinition} from '../../../../../skeleton/anim/serialization.ts'
import {isWindupStrike, phaseDurationOf, resolvePhases} from '../../../../../character/combat/attack_phases.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import type {BoneAnimationClip} from '../../../../../skeleton/anim/types.ts'
import type {SkeletonPose} from '../../../../../skeleton/skeleton.ts'
import {DEFAULT_HANDEDNESS} from '../../../../../character/handedness.ts'
import {walkSpeedScale} from '../../../appearance/constants.ts'
import {ENGAGED_WALK_MIN_SPEED} from '../state/constants.ts'
import {
    defineFormAnimation,
    type FormAnimation,
    type FormAnimationOverlay,
    type FormClipVariant,
} from '../../common/skeleton_animation/form_animation.ts'

/**
 * 人形骨架静止姿态：攻击 clip 是稀疏作者数据，未声明关节必须在进入攻击时回到此姿态。
 * 该姿态只读复用；applyPose 会复制数值到桥接骨架。
 */
const HUMANOID_REST_POSE: SkeletonPose = skeletonFromDefinition(buildCharacterSkeletonDefinition()).readPose()

/** 蓄力进度映射到攻击 clip 前段的通用比例上限（0.5 ≈ 动作中段/满蓄力位；用于非「抬手 → 挥斩」结构的远程段） */
const CHARGE_SEEK_FRACTION = 0.5

/**
 * 近战重击的蓄力定位比例：满蓄力 = 抬手段末帧（= 松开后续播挥斩的起点）。
 * 蓄力姿势直接取攻击 clip 的抬手段，故与各武器实际的抬手姿势逐帧一致，
 * 松开蓄力时不会出现「先回位再抬手」的跳变；仅「抬手 → 挥斩」结构的近战段返回比例，其余返回 undefined。
 */
const meleeWindupFraction = (segment: AttackSegment): number | undefined => {
    const phases = resolvePhases(segment.phases)
    if (!isWindupStrike(phases)) return undefined
    const total = segment.duration + segment.recovery
    if (total <= 0) return undefined
    return phaseDurationOf(phases[0], segment.duration, segment.recovery) / total
}

/* 持盾臂集合（canonical 右撇子：主手 = 右、副手 = 左；左撇子由 clip 镜像处理）——复用常量避免逐帧分配 */
const NO_SHIELD_ARMS: readonly ('right' | 'left')[] = []
const RIGHT_SHIELD_ARM: readonly ('right' | 'left')[] = ['right']
const LEFT_SHIELD_ARM: readonly ('right' | 'left')[] = ['left']
const BOTH_SHIELD_ARMS: readonly ('right' | 'left')[] = ['right', 'left']

const shieldArmsOf = (shieldHands: Readonly<{main: boolean; off: boolean}>): readonly ('right' | 'left')[] => {
    if (shieldHands.main) return shieldHands.off ? BOTH_SHIELD_ARMS : RIGHT_SHIELD_ARM
    return shieldHands.off ? LEFT_SHIELD_ARM : NO_SHIELD_ARMS
}

/** 持盾臂集合 → 动画键后缀（按引用查表，避免逐帧字符串拼接） */
const SHIELD_ARM_KEY_SUFFIXES = new Map<readonly ('right' | 'left')[], string>([
    [NO_SHIELD_ARMS, ''],
    [RIGHT_SHIELD_ARM, ':sr'],
    [LEFT_SHIELD_ARM, ':sl'],
    [BOTH_SHIELD_ARMS, ':srl'],
])

const humanoidContextOf = (ctx: AnimationContext): NonNullable<AnimationContext['humanoid']> => ctx.humanoid ?? {
    holdMode: 'one_handed',
    handedness: DEFAULT_HANDEDNESS,
    shieldHands: {main: false, off: false},
}

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

const attackClipOf = (segment: AttackSegment, variant: FormClipVariant): BoneAnimationClip =>
    getAttackClipById(segment.poseId, variant.handedness ?? DEFAULT_HANDEDNESS)

/** 人形动画键：state + 攻击段 + 持握模式 + 盾臂 + 武器类 + 惯用手（任一变化都触发混合） */
const clipKeyOf = (state: CharacterState, ctx: AnimationContext): string => {
    const humanoid = humanoidContextOf(ctx)
    const weaponKey = ctx.weaponHeld ? `:${humanoid.holdMode}` : ':n'
    const shieldKey = SHIELD_ARM_KEY_SUFFIXES.get(shieldArmsOf(humanoid.shieldHands)) ?? ''
    const weaponClassKey = ctx.weaponHeld && humanoid.holdMode === 'two_handed' && humanoid.weaponClassId !== undefined
        ? `:w${humanoid.weaponClassId}`
        : ''
    const clipKey = isAttackState(state) && ctx.attackSegment !== undefined
        ? `attacking:${ctx.attackSegment.id}${ctx.attackHolding ? ':charging' : ''}${weaponClassKey}`
        : state === 'falling'
            ? `falling:${fallingSpeedTier(ctx.horizontalSpeed)}${weaponKey}${weaponClassKey}`
            : `${state}${weaponKey}${shieldKey}${weaponClassKey}`
    return `${clipKey}:${humanoid.handedness}`
}

/** 下半身行走覆盖层权重：只对双腿关节声明 1，其余关节不受影响 */
const WALK_LEG_WEIGHTS: Readonly<Record<string, number>> = Object.fromEntries(WALK_LEG_JOINTS.map(jointId => [jointId, 1]))

const createHumanoidOverlay = (): FormAnimationOverlay => {
    /* 格挡 / 蓄力攻击下半身行走叠加的相位累积（秒）：按水平速度步频推进，仅覆盖双腿 */
    let engagedWalkPhase = 0
    /* 下半身行走组合缓存：基础 clip / 行走腿 clip 变化时才重建 */
    let engagedWalkComposition: AnimationComposition | undefined
    let engagedWalkBaseClip: BoneAnimationClip | undefined
    let engagedWalkLegClip: BoneAnimationClip | undefined

    return ({dt, bridge, player, state, ctx, variant}) => {
        if (ctx.horizontalSpeed < ENGAGED_WALK_MIN_SPEED
            || (state !== 'blocking' && !(state === 'attacking' && ctx.attackHolding))) {
            engagedWalkPhase = 0
            return
        }
        const baseClip = player.clip
        const legClip = getWalkLegsClip(variant.handedness ?? DEFAULT_HANDEDNESS)
        if (engagedWalkComposition === undefined || engagedWalkBaseClip !== baseClip || engagedWalkLegClip !== legClip) {
            engagedWalkBaseClip = baseClip
            engagedWalkLegClip = legClip
            engagedWalkComposition = {
                id: 'humanoid:engaged_walk',
                duration: legClip.duration,
                layers: [
                    {source: {clip: legClip}, weight: 1, start: 0, end: legClip.duration, jointWeights: WALK_LEG_WEIGHTS},
                ],
            }
        }
        engagedWalkPhase += dt * walkSpeedScale(ctx.horizontalSpeed)
        const phase = engagedWalkComposition.duration > 0
            ? engagedWalkPhase % engagedWalkComposition.duration
            : 0
        bridge.applyPose(jointEulersToSkeletonPose(sampleComposition(engagedWalkComposition, phase), bridge))
    }
}

/** 人形动画定义：运行时系统与骨骼编辑器共用同一份 clip provider。 */
export const HUMANOID_ANIMATION: FormAnimation = defineFormAnimation({
    skeleton: buildCharacterSkeletonDefinition,
    baseClip: baseClipOf,
    attackClip: attackClipOf,
    clipKey: clipKeyOf,
    restPose: () => HUMANOID_REST_POSE,
    chargeSeekScale: segment => meleeWindupFraction(segment) ?? CHARGE_SEEK_FRACTION,
    createOverlay: createHumanoidOverlay,
    weaponVariants: true,
})
