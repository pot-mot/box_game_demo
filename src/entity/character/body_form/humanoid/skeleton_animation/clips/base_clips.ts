import {Euler, Quaternion, Vector3} from 'three'
import type {BoneAnimationClip, BoneJointKeyframeRecord} from '../../../../../../skeleton/anim/types.ts'
import type {JointPose} from '../../../../../../skeleton/skeleton.ts'
import type {HoldMode} from '../../../../../../character/weapon/hold_mode.ts'
import {DEFAULT_HANDEDNESS, type Handedness} from '../../../../../../character/handedness.ts'
import {mirrorClip} from '../../../../../../skeleton/anim/mirror.ts'
import {CLIP_SAMPLE_FPS} from '../../state/constants.ts'
import {BASE_CLIP_META, BASE_POSE_SAMPLERS, adjustArmsForHoldMode, orientShieldArms, type PoseState} from '../pose_fns.ts'
import {applySupportHandTracks} from './support_hand_merge.ts'
import {createSupportHandClip} from './support_hand_clip.ts'
import {SUPPORT_HAND_BASE} from './generated/support_hand_base.ts'
import {CHARACTER_JOINT_IDS, CHARACTER_JOINT_REST_POSITIONS, WALK_LEG_JOINTS, type CharacterJointId} from './rest_pose.ts'
export {CHARACTER_JOINT_IDS, CHARACTER_JOINT_REST_POSITIONS, WALK_LEG_JOINTS, type CharacterJointId} from './rest_pose.ts'

const eulerOf = (state: {rx: number; ry: number; rz: number}): Euler => new Euler(state.rx, state.ry, state.rz)

/** 关节静止位置（动画只改旋转；spine 例外，spine.position 有前倾/下沉动画） */
const restPositionOf = (jointId: CharacterJointId): Vector3 =>
    new Vector3().fromArray([...CHARACTER_JOINT_REST_POSITIONS[jointId]])

const poseToRecord = (pose: PoseState): ReadonlyMap<CharacterJointId, JointPose> => {
    const map = new Map<CharacterJointId, JointPose>()
    const set = (jointId: CharacterJointId, rotation: {rx: number; ry: number; rz: number}, position: Vector3 = restPositionOf(jointId)): void => {
        map.set(jointId, {position, rotation: new Quaternion().setFromEuler(eulerOf(rotation))})
    }
    set('rightArmShoulder', pose.rightArmShoulder)
    set('rightArmElbow', pose.rightArmElbow)
    set('rightHandPivot', pose.rightHandPivot)
    set('rightWristPivot', pose.rightWristPivot)
    set('rightWeaponMount', pose.rightWeaponMount)
    set('leftArmShoulder', pose.leftArmShoulder)
    set('leftArmElbow', pose.leftArmElbow)
    set('leftHandPivot', pose.leftHandPivot)
    set('leftWristPivot', pose.leftWristPivot)
    set('leftWeaponMount', pose.leftWeaponMount)
    set('rightLegHip', pose.rightLegHip)
    set('rightLegKnee', pose.rightLegKnee)
    set('leftLegHip', pose.leftLegHip)
    set('leftLegKnee', pose.leftLegKnee)
    set('headNeck', pose.headNeck)
    set('spine', pose.spine.rotation, new Vector3().fromArray([...pose.spine.position]))
    set('root', pose.root.rotation)
    return map
}

/**
 * 基础状态 clip 生成器：按固定采样率烘焙姿态公式为关键帧（运行时纯 clip 播放）。
 * horizontalSpeed 仅影响 falling（腿张开随速度，离散档）；行走步频由播放器 setSpeed 变速。
 * 循环动画采样 [0, duration]（含末帧，wrap 无缝由采样器处理）；非循环采样全程。
 */
/** 用指定关节子集烘焙基础状态 clip（分层：下半身/体态 与 上半身手臂分别生成） */
const buildBaseClipWithJoints = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    jointIds: readonly CharacterJointId[],
    weaponHeld: boolean,
    horizontalSpeed: number,
    holdMode: HoldMode | undefined,
    shieldArms: readonly ('right' | 'left')[] = [],
    handedness: Handedness = DEFAULT_HANDEDNESS,
    blockArmOverride?: 'right' | 'left',
    weaponClassId?: string,
): BoneAnimationClip => {
    const meta = BASE_CLIP_META[state]
    const sampler = BASE_POSE_SAMPLERS[state]
    /* 格挡举盾手：主手盾优先（与 `updateShieldBlock` 的盾来源一致） */
    const blockArm: 'right' | 'left' | undefined = state !== 'blocking'
        ? undefined
        : blockArmOverride ?? (shieldArms.includes('right') ? 'right' : shieldArms.includes('left') ? 'left' : undefined)
    const frameCount = Math.max(2, Math.round(meta.duration * CLIP_SAMPLE_FPS) + 1)
    const tracks = jointIds.map(jointId => {
        const records: BoneJointKeyframeRecord[] = []
        for (let i = 0; i < frameCount; i++) {
            const t = meta.duration * i / (frameCount - 1)
            const sampled = sampler(t, {
                weaponHeld,
                horizontalSpeed,
                ...(weaponClassId !== undefined ? {weaponClassId} : {}),
                ...(blockArm !== undefined ? {blockArm} : {}),
            })
            const pose = orientShieldArms(adjustArmsForHoldMode(sampled, holdMode, weaponHeld, state), shieldArms)
            const record = poseToRecord(pose).get(jointId)!
            records.push({time: t, position: record.position, rotation: record.rotation})
        }
        return {
            targetId: jointId,
            /* 关键帧间插值：bezier_quad + none（线性） */
            interpolation: {type: 'bezier_quad', strategy: 'none'} as const,
            records,
        }
    })

    const clip: BoneAnimationClip = {
        name: `${state}${weaponHeld ? '_held' : ''}`,
        duration: meta.duration,
        loop: meta.loop,
        jointTracks: tracks,
        boneTracks: [],
        eventTracks: [],
    }
    /* 左撇子：对 canonical 姿态施加矢状面反射（左右关节互换 + 旋转共轭），离线烘焙零运行时开销 */
    return handedness === DEFAULT_HANDEDNESS ? clip : mirrorClip(clip)
}

/** 完整基础状态 clip（测试 / 工具用；生产走 canonical + 持握覆盖组合） */
export const buildBaseClip = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    horizontalSpeed = 0,
    handedness: Handedness = DEFAULT_HANDEDNESS,
    weaponClassId?: string,
): BoneAnimationClip =>
    buildBaseClipWithJoints(state, CHARACTER_JOINT_IDS, weaponHeld, horizontalSpeed, undefined, [], handedness, undefined, weaponClassId)

/** falling 腿张开速度档（legSpread = min(speed,4)×0.04，取整档避免频繁切 clip） */
export const fallingSpeedTier = (horizontalSpeed: number): number =>
    Math.min(Math.max(Math.round(Math.min(horizontalSpeed, 4)), 0), 4)

/* ── 底盘行走叠加 clip 缓存（格挡 / 蓄力攻击时用行走步态覆盖双腿；仅依赖惯用手） ── */
const walkLegsClipCache = new Map<Handedness, BoneAnimationClip>()

/**
 * 腿部行走步态 clip（仅含 `WALK_LEG_JOINTS`）：格挡 / 蓄力攻击时与上半身姿态叠加，
 * 使下半身按水平速度摆腿。进度的步频由调用方按 `walkSpeedScale` 累加，故此处按基准速度 0 烘焙。
 */
export const getWalkLegsClip = (handedness: Handedness = DEFAULT_HANDEDNESS): BoneAnimationClip => {
    const cached = walkLegsClipCache.get(handedness)
    if (cached !== undefined) return cached
    const clip = buildBaseClipWithJoints('walking', WALK_LEG_JOINTS, false, 0, undefined, [], handedness)
    walkLegsClipCache.set(handedness, clip)
    return clip
}


/* ── 进度式组合用：规范基础 clip（不含持握/盾臂）与持握/盾臂覆盖 clip ── */

const HOLD_ARM_JOINTS: readonly CharacterJointId[] = [
    'leftArmShoulder', 'leftArmElbow', 'leftHandPivot', 'leftWristPivot', 'leftWeaponMount',
]

/** 双手支撑手已覆盖左肩/左肘时，仍需复制到副手的手部链 */
const HOLD_SUPPORT_HAND_JOINTS: readonly CharacterJointId[] = [
    'leftHandPivot', 'leftWristPivot', 'leftWeaponMount',
]

const canonicalClipCache = new Map<string, BoneAnimationClip>()

/** 规范基础 clip：只含基础姿态 + 双手支撑手烘焙；持握/盾臂由覆盖组合提供 */
export const getCanonicalBaseClip = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    horizontalSpeed = 0,
    handedness: Handedness = DEFAULT_HANDEDNESS,
    weaponClassId?: string,
    includeSupport = true,
    blockArm?: 'right' | 'left',
): BoneAnimationClip => {
    const speedKey = state === 'falling' ? `:${fallingSpeedTier(horizontalSpeed)}` : ''
    const weaponKey = weaponHeld && weaponClassId !== undefined ? `:w${weaponClassId}` : ''
    const key = `${handedness}:${state}:${weaponHeld ? 'w' : 'n'}${speedKey}${weaponKey}:${includeSupport ? 's' : 'x'}:${blockArm ?? ''}`
    const cached = canonicalClipCache.get(key)
    if (cached !== undefined) return cached
    const canonical = buildBaseClipWithJoints(
        state,
        CHARACTER_JOINT_IDS,
        weaponHeld,
        horizontalSpeed,
        undefined,
        [],
        DEFAULT_HANDEDNESS,
        blockArm,
        weaponClassId,
    )
    const support = includeSupport && weaponHeld && weaponClassId !== undefined
        ? SUPPORT_HAND_BASE[weaponClassId]?.[state]
        : undefined
    const posable = applySupportHandTracks(canonical, support, CHARACTER_JOINT_REST_POSITIONS)
    const clip = handedness === DEFAULT_HANDEDNESS ? posable : mirrorClip(posable)
    canonicalClipCache.set(key, clip)
    return clip
}

const baseSupportHandClipCache = new Map<string, BoneAnimationClip>()

/** 基础状态支撑手只含左肩/左肘的 clip（双手共持；无数据返回 undefined） */
export const getBaseSupportHandClip = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponClassId: string,
    handedness: Handedness = DEFAULT_HANDEDNESS,
): BoneAnimationClip | undefined => {
    const data = SUPPORT_HAND_BASE[weaponClassId]?.[state]
    if (data === undefined) return undefined
    const key = `${handedness}:${state}:${weaponClassId}`
    const cached = baseSupportHandClipCache.get(key)
    if (cached !== undefined) return cached
    const meta = BASE_CLIP_META[state]
    const clip = createSupportHandClip(`support_${state}_${weaponClassId}`, meta.duration, meta.loop, data, handedness)
    baseSupportHandClipCache.set(key, clip)
    return clip
}

const humanoidOverlayClipCache = new Map<string, BoneAnimationClip>()

/** 基础状态覆盖合辑：支撑手 + 持握/盾臂（目标关节互不重叠） */
export const getHumanoidOverlayClip = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    holdMode: HoldMode,
    shieldArms: readonly ('right' | 'left')[],
    handedness: Handedness = DEFAULT_HANDEDNESS,
    weaponClassId?: string,
): BoneAnimationClip | undefined => {
    const support = weaponHeld && holdMode === 'two_handed' && weaponClassId !== undefined
        ? getBaseSupportHandClip(state, weaponClassId, handedness)
        : undefined
    const holdShield = getHoldShieldOverlayClip(state, weaponHeld, holdMode, shieldArms, handedness, weaponClassId)
    if (support === undefined) return holdShield
    if (holdShield === undefined) return support
    const key = `${handedness}:${state}:${weaponHeld ? holdMode : 'n'}:${shieldArms.map(arm => arm[0]).join('')}:${weaponClassId ?? ''}`
    const cached = humanoidOverlayClipCache.get(key)
    if (cached !== undefined) return cached
    const meta = BASE_CLIP_META[state]
    const clip: BoneAnimationClip = {
        name: `humanoid_overlay_${state}`,
        duration: meta.duration,
        loop: meta.loop,
        jointTracks: [...support.jointTracks, ...holdShield.jointTracks],
        boneTracks: [],
        eventTracks: [],
    }
    humanoidOverlayClipCache.set(key, clip)
    return clip
}

const holdShieldClipCache = new Map<string, BoneAnimationClip>()

/**
 * 持握 / 盾臂覆盖 clip（只含需要覆盖的关节）：
 * - 双手/双持持握：左臂；
 * - 盾臂：对应 weaponMount；
 * - 已由支撑手烘焙覆盖的双手状态不再重复生成左臂。
 */
export const getHoldShieldOverlayClip = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    holdMode: HoldMode,
    shieldArms: readonly ('right' | 'left')[],
    handedness: Handedness = DEFAULT_HANDEDNESS,
    weaponClassId?: string,
): BoneAnimationClip | undefined => {
    const hasSupport = weaponHeld && holdMode === 'two_handed' && weaponClassId !== undefined
        && SUPPORT_HAND_BASE[weaponClassId]?.[state] !== undefined
    const includeHold = weaponHeld && holdMode !== 'one_handed' && !shieldArms.includes('left')
    const holdJointIds = hasSupport ? HOLD_SUPPORT_HAND_JOINTS : HOLD_ARM_JOINTS
    const shieldJointIds: CharacterJointId[] = shieldArms.map(arm => arm === 'right' ? 'rightWeaponMount' : 'leftWeaponMount')
    const jointIds = [...(includeHold ? holdJointIds : []), ...shieldJointIds]
    if (jointIds.length === 0) return undefined

    const shieldKey = shieldArms.length > 0 ? `:s${shieldArms.map(arm => arm[0]).join('')}` : ''
    const key = `${handedness}:${state}:${weaponHeld ? holdMode : 'n'}${shieldKey}${hasSupport ? ':sup' : ''}`
    const cached = holdShieldClipCache.get(key)
    if (cached !== undefined) return cached

    const meta = BASE_CLIP_META[state]
    const sampler = BASE_POSE_SAMPLERS[state]
    const blockArm: 'right' | 'left' | undefined = state !== 'blocking'
        ? undefined
        : shieldArms.includes('right') ? 'right' : shieldArms.includes('left') ? 'left' : undefined
    const frameCount = Math.max(2, Math.round(meta.duration * CLIP_SAMPLE_FPS) + 1)
    const tracks = jointIds.map(jointId => {
        const records: BoneJointKeyframeRecord[] = []
        for (let i = 0; i < frameCount; i++) {
            const t = meta.duration * i / (frameCount - 1)
            const sampled = sampler(t, {
                weaponHeld,
                horizontalSpeed: 0,
                ...(blockArm !== undefined ? {blockArm} : {}),
            })
            const held = includeHold
                ? adjustArmsForHoldMode(sampled, holdMode, weaponHeld, state)
                : sampled
            const pose = shieldArms.length > 0 ? orientShieldArms(held, shieldArms) : held
            const record = poseToRecord(pose).get(jointId)
            if (record === undefined) continue
            records.push({time: t, position: record.position, rotation: record.rotation})
        }
        return {
            targetId: jointId,
            interpolation: {type: 'bezier_quad', strategy: 'none'} as const,
            records,
        }
    }).filter(track => track.records.length > 0)

    const clip: BoneAnimationClip = {
        name: `${state}_hold_shield`,
        duration: meta.duration,
        loop: meta.loop,
        jointTracks: tracks,
        boneTracks: [],
        eventTracks: [],
    }
    const result = handedness === DEFAULT_HANDEDNESS ? clip : mirrorClip(clip)
    holdShieldClipCache.set(key, result)
    return result
}
