import {Euler} from 'three'
import type {AnimationContext} from '../../../appearance/types.ts'
import {isAttackState, type CharacterStateName} from '../../../../../character/state_machine/types.ts'
import {DEFAULT_HANDEDNESS, type Handedness} from '../../../../../character/handedness.ts'
import type {HoldMode} from '../../../../../character/weapon/hold_mode.ts'
import {isWindupStrike, phaseDurationOf, resolvePhases} from '../../../../../character/combat/attack_phases.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import {buildCharacterSkeletonDefinition} from '../skeleton/skeleton.ts'
import {skeletonFromDefinition} from '../../../../../skeleton/anim/serialization.ts'
import type {JointEulers, JointPose} from '../../common/creature_runtime/pose.ts'
import {
    evaluateProgressComposition,
    type ProgressAnimationComposition,
    type ProgressAnimationEvent,
    type ProgressAnimationLeaf,
    type ProgressAnimationParams,
    type ProgressWeight,
    type ProgressAnimationLayer,
} from '../../common/skeleton_animation/progress_composition.ts'
import {createProgressClipLeaf} from '../../common/skeleton_animation/progress_clip_leaf.ts'
import {variantOfAnimationContext, type FormClipVariant} from '../../common/skeleton_animation/form_animation.ts'
import {
    CHARACTER_JOINT_REST_POSITIONS,
    WALK_LEG_JOINTS,
    getCanonicalBaseClip,
    getHumanoidOverlayClip,
    getWalkLegsClip,
} from './clips/base_clips.ts'
import {getAttackBodyClipById, getAttackSupportHandClip} from './clips/attack_clips.ts'
import {BASE_CLIP_META, BASE_POSE_SAMPLERS} from './pose_fns.ts'
import {walkSpeedScale} from '../../../appearance/constants.ts'
import {ENGAGED_WALK_MIN_SPEED} from '../state/constants.ts'

export interface HumanoidFrame {
    readonly key: string
    readonly graph: ProgressAnimationComposition
    readonly progress: number
    readonly params: ProgressAnimationParams
    readonly restPose: JointEulers
    readonly events: readonly ProgressAnimationEvent[]
}

const CHARGE_SEEK_FRACTION = 0.5

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const numberParam = (params: ProgressAnimationParams, key: string, fallback: number): number => {
    const value = params[key]
    return typeof value === 'number' ? value : fallback
}

const vectorParam = (
    params: ProgressAnimationParams,
    key: string,
    fallback: readonly [number, number, number],
): readonly [number, number, number] => {
    const value = params[key]
    return Array.isArray(value)
        ? [value[0], value[1], value[2]]
        : fallback
}

const restPose: JointEulers = (() => {
    const pose = skeletonFromDefinition(buildCharacterSkeletonDefinition()).readPose()
    const out: Record<string, JointPose> = {}
    for (const [jointId, jointPose] of pose.jointPoses) {
        const euler = new Euler().setFromQuaternion(jointPose.rotation, 'XYZ')
        out[jointId] = {
            rotation: [euler.x, euler.y, euler.z],
            position: [jointPose.position.x, jointPose.position.y, jointPose.position.z],
        }
    }
    return out
})()

const restRotation = (jointId: string): readonly [number, number, number] => {
    const pose = restPose[jointId]
    if (pose === undefined) return [0, 0, 0]
    return 'rotation' in pose ? pose.rotation : pose
}

const shieldArmsOf = (hands: Readonly<{main: boolean; off: boolean}>): readonly ('right' | 'left')[] => {
    if (hands.main) return hands.off ? ['right', 'left'] : ['right']
    return hands.off ? ['left'] : []
}

const chargeSeekScale = (segment: AttackSegment): number => {
    const phases = resolvePhases(segment.phases)
    if (!isWindupStrike(phases)) return CHARGE_SEEK_FRACTION
    const total = segment.duration + segment.recovery
    if (total <= 0) return CHARGE_SEEK_FRACTION
    return phaseDurationOf(phases[0], segment.duration, segment.recovery) / total
}

const baseProgress = (state: Exclude<CharacterStateName, 'attacking' | 'air_attacking'>, ctx: AnimationContext): number => {
    const meta = BASE_CLIP_META[state]
    const duration = ctx.stateDuration ?? meta.duration
    const speedScale = state === 'walking' || state === 'swimming' ? walkSpeedScale(ctx.horizontalSpeed) : 1
    const raw = duration > 0 ? (ctx.stateTime * speedScale) / duration : 0
    return meta.loop ? raw - Math.floor(raw) : clamp01(raw)
}

const attackProgress = (ctx: AnimationContext): number => {
    const segment = ctx.attackSegment
    if (segment === undefined) return 0
    if (ctx.attackHolding) return clamp01(ctx.attackCharge * chargeSeekScale(segment))
    return clamp01(ctx.attackTotalProgress)
}

const buildParams = (ctx: AnimationContext, stateProgress: number, walkProgress: number): ProgressAnimationParams => {
    const facingYaw = ctx.facingYaw ?? 0
    const aim = ctx.aimDirection ?? {x: Math.sin(facingYaw), y: 0, z: Math.cos(facingYaw)}
    return {
        horizontalSpeed: ctx.horizontalSpeed,
        verticalSpeed: ctx.verticalSpeed ?? 0,
        turnRate: ctx.turnRate ?? 0,
        facingYaw,
        aimDirection: [aim.x, aim.y, aim.z],
        attackCharge: ctx.attackCharge,
        attackTotalProgress: ctx.attackTotalProgress,
        stateProgress,
        walkProgress,
    }
}

const FALLING_LEGS_LEAF: ProgressAnimationLeaf = {
    id: 'humanoid:falling_legs',
    joints: WALK_LEG_JOINTS,
    sample: (progress, params) => {
        const pose = BASE_POSE_SAMPLERS.falling(progress * BASE_CLIP_META.falling.duration, {
            weaponHeld: false,
            horizontalSpeed: numberParam(params, 'horizontalSpeed', 0),
            verticalSpeed: numberParam(params, 'verticalSpeed', 0),
        })
        const out: Record<string, JointPose> = {}
        const setLeg = (jointId: 'rightLegHip' | 'rightLegKnee' | 'leftLegHip' | 'leftLegKnee'): void => {
            const euler = pose[jointId]
            out[jointId] = {
                rotation: [euler.rx, euler.ry, euler.rz],
                position: CHARACTER_JOINT_REST_POSITIONS[jointId],
            }
        }
        setLeg('rightLegHip')
        setLeg('rightLegKnee')
        setLeg('leftLegHip')
        setLeg('leftLegKnee')
        return out
    },
}

const TURN_AIM_LEAF: ProgressAnimationLeaf = {
    id: 'humanoid:turn_aim',
    joints: ['spine', 'headNeck'],
    sample: (_progress, params) => {
        const turn = Math.max(-8, Math.min(8, numberParam(params, 'turnRate', 0)))
        const facing = numberParam(params, 'facingYaw', 0)
        const aim = vectorParam(params, 'aimDirection', [0, 0, 1])
        let delta = Math.atan2(aim[0], aim[2]) - facing
        delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI
        const spine = restRotation('spine')
        const head = restRotation('headNeck')
        return {
            spine: {
                rotation: [spine[0], spine[1] + delta * 0.03, spine[2] - turn * 0.015],
                position: CHARACTER_JOINT_REST_POSITIONS.spine,
            },
            headNeck: {
                rotation: [head[0], head[1] + delta * 0.1, head[2] + turn * 0.01],
                position: CHARACTER_JOINT_REST_POSITIONS.headNeck,
            },
        }
    },
}

const TURN_AIM_LAYER = {source: TURN_AIM_LEAF, from: 0, to: 1, weight: 1, mode: 'additive' as const}

const baseGraphCache = new Map<string, ProgressAnimationComposition>()

const baseGraph = (
    state: Exclude<CharacterStateName, 'attacking' | 'air_attacking'>,
    variant: FormClipVariant,
): {graph: ProgressAnimationComposition; key: string} => {
    const weaponHeld = variant.weaponHeld
    const holdMode: HoldMode = variant.holdMode ?? 'one_handed'
    const handedness: Handedness = variant.handedness ?? DEFAULT_HANDEDNESS
    const shieldArms = shieldArmsOf(variant.shieldHands ?? {main: false, off: false})
    const overlayClip = getHumanoidOverlayClip(state, weaponHeld, holdMode, shieldArms, handedness, variant.weaponClassId)
    const overlayJoints = overlayClip?.jointTracks.map(track => track.targetId) ?? []
    const fallingJoints = state === 'falling' ? WALK_LEG_JOINTS : []
    const blockedJoints = new Set([...overlayJoints, ...fallingJoints])
    const bodyJointWeights: Record<string, ProgressWeight> = Object.fromEntries(
        [...blockedJoints].map(jointId => [jointId, 0]),
    )
    const moveWeight = (params: ProgressAnimationParams): number =>
        numberParam(params, 'horizontalSpeed', 0) >= ENGAGED_WALK_MIN_SPEED ? 1 : 0
    if (state === 'blocking') {
        for (const jointId of WALK_LEG_JOINTS) bodyJointWeights[jointId] = params => 1 - moveWeight(params)
    }
    const key = `base:${state}:${weaponHeld ? 'w' : 'n'}:${holdMode}:${shieldArms.map(arm => arm[0]).join('')}:${handedness}:${variant.weaponClassId ?? ''}`
    const cached = baseGraphCache.get(key)
    if (cached !== undefined) return {graph: cached, key}
    const blockArm = state === 'blocking'
        ? (shieldArms.includes('right') ? 'right' : shieldArms.includes('left') ? 'left' : undefined)
        : undefined
    const bodyClip = getCanonicalBaseClip(state, weaponHeld, 0, handedness, variant.weaponClassId, false, blockArm)
    const layers: ProgressAnimationLayer[] = [{
        source: createProgressClipLeaf(`humanoid:body:${key}`, bodyClip),
        from: 0,
        to: 1,
        weight: 1,
        ...(Object.keys(bodyJointWeights).length > 0 ? {jointWeights: bodyJointWeights} : {}),
        mode: 'normal',
    }]
    if (overlayClip !== undefined) {
        layers.push({
            source: createProgressClipLeaf(`humanoid:overlay:${key}`, overlayClip),
            from: 0,
            to: 1,
            weight: 1,
            mode: 'normal',
        })
    }
    if (state === 'falling') {
        layers.push({source: FALLING_LEGS_LEAF, from: 0, to: 1, weight: 1, mode: 'normal'})
    }
    if (state === 'blocking') {
        const legsClip = getWalkLegsClip(handedness)
        layers.push({
            source: createProgressClipLeaf(`humanoid:blocking_legs:${handedness}`, legsClip, {joints: WALK_LEG_JOINTS}),
            from: 0,
            to: 1,
            weight: moveWeight,
            progress: params => numberParam(params, 'walkProgress', 0),
            mode: 'normal',
        })
    }
    layers.push(TURN_AIM_LAYER)
    const graph: ProgressAnimationComposition = {id: `humanoid:${key}`, layers}
    baseGraphCache.set(key, graph)
    return {graph, key}
}

interface AttackGraphEntry {
    readonly graph: ProgressAnimationComposition
    readonly events: readonly ProgressAnimationEvent[]
}

const attackGraphCache = new Map<string, AttackGraphEntry>()

const attackGraph = (
    ctx: AnimationContext,
    variant: FormClipVariant,
): AttackGraphEntry & {key: string} => {
    const segment = ctx.attackSegment
    if (segment === undefined) {
        const base = baseGraph('idle', variant)
        return {graph: base.graph, key: base.key, events: []}
    }
    const handedness: Handedness = variant.handedness ?? DEFAULT_HANDEDNESS
    const key = `attack:${segment.poseId}:${handedness}`
    const cached = attackGraphCache.get(key)
    if (cached !== undefined) return {...cached, key}

    const bodyClip = getAttackBodyClipById(segment.poseId, handedness)
    const supportClip = getAttackSupportHandClip(segment.poseId, handedness)
    const legsClip = getWalkLegsClip(handedness)
    const supportJoints = supportClip?.jointTracks.map(track => track.targetId) ?? []
    const moveWeight = (params: ProgressAnimationParams): number =>
        numberParam(params, 'horizontalSpeed', 0) >= ENGAGED_WALK_MIN_SPEED ? 1 : 0
    const bodyJointWeights: Record<string, ProgressWeight> = {}
    for (const jointId of supportJoints) bodyJointWeights[jointId] = 0
    for (const jointId of WALK_LEG_JOINTS) bodyJointWeights[jointId] = params => 1 - moveWeight(params)

    const layers: ProgressAnimationLayer[] = [{
        source: createProgressClipLeaf(`humanoid:attack_body:${segment.poseId}`, bodyClip),
        from: 0,
        to: 1,
        weight: 1,
        jointWeights: bodyJointWeights,
        mode: 'normal',
    }]
    if (supportClip !== undefined) {
        layers.push({
            source: createProgressClipLeaf(`humanoid:attack_support:${segment.poseId}`, supportClip),
            from: 0,
            to: 1,
            weight: 1,
            mode: 'normal',
        })
    }
    layers.push({
        source: createProgressClipLeaf(`humanoid:attack_legs:${segment.poseId}`, legsClip, {joints: WALK_LEG_JOINTS}),
        from: 0,
        to: 1,
        weight: moveWeight,
        progress: params => numberParam(params, 'walkProgress', 0),
        mode: 'normal',
    })
    layers.push(TURN_AIM_LAYER)

    const events: ProgressAnimationEvent[] = bodyClip.eventTracks
        .flatMap(track => track.records)
        .map(record => ({
            progress: bodyClip.duration > 0 ? clamp01(record.time / bodyClip.duration) : 0,
            eventName: record.eventName,
            ...(record.params !== undefined ? {params: record.params} : {}),
        }))
        .sort((a, b) => a.progress - b.progress)
    const entry: AttackGraphEntry = {graph: {id: `humanoid:${key}`, layers}, events}
    attackGraphCache.set(key, entry)
    return {...entry, key}
}

/** 解析人形当前帧：组合图 + 根 progress + 参数 + 事件 */
export const resolveHumanoidFrame = (state: CharacterStateName, ctx: AnimationContext): HumanoidFrame => {
    const variant = variantOfAnimationContext(ctx)
    if (isAttackState(state)) {
        const resolved = attackGraph(ctx, variant)
        const progress = attackProgress(ctx)
        const walkClip = getWalkLegsClip(variant.handedness ?? DEFAULT_HANDEDNESS)
        const walkProgress = walkClip.duration > 0
            ? (ctx.stateTime * walkSpeedScale(ctx.horizontalSpeed) / walkClip.duration) % 1
            : 0
        return {
            key: resolved.key,
            graph: resolved.graph,
            progress,
            params: buildParams(ctx, progress, walkProgress),
            restPose,
            events: resolved.events,
        }
    }
    const resolved = baseGraph(state, variant)
    const progress = baseProgress(state, ctx)
    const walkClip = getWalkLegsClip(variant.handedness ?? DEFAULT_HANDEDNESS)
    const walkProgress = state === 'blocking' && walkClip.duration > 0
        ? (ctx.stateTime * walkSpeedScale(ctx.horizontalSpeed) / walkClip.duration) % 1
        : 0
    return {
        key: resolved.key,
        graph: resolved.graph,
        progress,
        params: buildParams(ctx, progress, walkProgress),
        restPose,
        events: [],
    }
}

/** 供测试/调试直接求值当前帧 */
export const evaluateHumanoidFrame = (state: CharacterStateName, ctx: AnimationContext): JointEulers => {
    const frame = resolveHumanoidFrame(state, ctx)
    return evaluateProgressComposition(frame.graph, frame.progress, {restPose: frame.restPose, params: frame.params})
}
