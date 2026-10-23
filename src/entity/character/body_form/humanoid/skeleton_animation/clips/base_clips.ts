import {Euler, Quaternion, Vector3} from 'three'
import type {BoneAnimationClip, BoneJointKeyframeRecord} from '../../../../../../skeleton/anim/types.ts'
import type {JointPose} from '../../../../../../skeleton/skeleton.ts'
import type {HoldMode} from '../../../../../../character/weapon/hold_mode.ts'
import {DEFAULT_HANDEDNESS, type Handedness} from '../../../../../../character/handedness.ts'
import {mirrorClip} from '../../../../../../skeleton/anim/mirror.ts'
import {CLIP_SAMPLE_FPS} from '../../state/constants.ts'
import {BASE_CLIP_META, BASE_POSE_SAMPLERS, adjustArmsForHoldMode, orientShieldArms, type PoseState} from '../pose_fns.ts'
import {applySupportHandTracks} from './support_hand_merge.ts'
import {SUPPORT_HAND_BASE} from './generated/support_hand_base.ts'
import {
    MODEL_BASE_HEIGHT,
    MODEL_BASE_WIDTH,
    BODY_RATIO,
    LEG_RATIO,
    ARM_X_GAP,
    LEG_X_GAP,
} from '../../../../../../render/constants.ts'

/** 可动画关节 id 列表（与 CharacterModel 关节一一对应，顺序固定） */
export const CHARACTER_JOINT_IDS = [
    'rightArmShoulder',
    'rightArmElbow',
    'rightHandPivot',
    'rightWristPivot',
    'rightWeaponMount',
    'leftArmShoulder',
    'leftArmElbow',
    'leftHandPivot',
    'leftWristPivot',
    'leftWeaponMount',
    'rightLegHip',
    'rightLegKnee',
    'leftLegHip',
    'leftLegKnee',
    'headNeck',
    'spine',
    'root',
] as const

export type CharacterJointId = typeof CHARACTER_JOINT_IDS[number]

/** 底盘行走叠加层所用关节（格挡 / 蓄力攻击时仅覆盖双腿，双腿与上半身关节不重叠） */
export const WALK_LEG_JOINTS: readonly CharacterJointId[] = [
    'rightLegHip', 'rightLegKnee', 'leftLegHip', 'leftLegKnee',
]

/* ── 关节静止局部位置（模型 Group 层级，相对父关节；由 render 比例常量推导）。
 *   动画只改旋转，关节 position 固定 —— 播放器 applyPose 写回这些静止值，防止头部等部位被拉回原点 ── */
const REST_BODY_H = MODEL_BASE_HEIGHT * BODY_RATIO
const REST_LEG_H = MODEL_BASE_HEIGHT * LEG_RATIO
const REST_UPPER_ARM_H = REST_BODY_H / 2
const REST_HIP_H = REST_LEG_H / 2
const REST_SHOULDER_X = MODEL_BASE_WIDTH / 2 + ARM_X_GAP
const REST_HIP_X = LEG_X_GAP

export const CHARACTER_JOINT_REST_POSITIONS: Readonly<Record<CharacterJointId, readonly [number, number, number]>> = {
    rightArmShoulder: [-REST_SHOULDER_X, REST_BODY_H, 0],
    rightArmElbow: [0, -REST_UPPER_ARM_H, 0],
    rightHandPivot: [0, -REST_UPPER_ARM_H, 0],
    rightWristPivot: [0, 0, 0],
    rightWeaponMount: [0, 0, 0],
    leftArmShoulder: [REST_SHOULDER_X, REST_BODY_H, 0],
    leftArmElbow: [0, -REST_UPPER_ARM_H, 0],
    leftHandPivot: [0, -REST_UPPER_ARM_H, 0],
    leftWristPivot: [0, 0, 0],
    leftWeaponMount: [0, 0, 0],
    /* 模型原点在脚底：root 直接子关节（双腿髋/spine）位于腿长高度 */
    rightLegHip: [-REST_HIP_X, REST_LEG_H, 0],
    rightLegKnee: [0, -REST_HIP_H, 0],
    leftLegHip: [REST_HIP_X, REST_LEG_H, 0],
    leftLegKnee: [0, -REST_HIP_H, 0],
    headNeck: [0, REST_BODY_H, 0],
    spine: [0, REST_LEG_H, 0],
    root: [0, 0, 0],
}

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
): BoneAnimationClip => {
    const meta = BASE_CLIP_META[state]
    const sampler = BASE_POSE_SAMPLERS[state]
    /* 格挡举盾手：主手盾优先（与 `updateShieldBlock` 的盾来源一致） */
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
                horizontalSpeed,
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

/** 完整基础状态 clip（编辑器动画库 / 兼容全骨架播放） */
export const buildBaseClip = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    horizontalSpeed = 0,
    handedness: Handedness = DEFAULT_HANDEDNESS,
): BoneAnimationClip =>
    buildBaseClipWithJoints(state, CHARACTER_JOINT_IDS, weaponHeld, horizontalSpeed, undefined, [], handedness)

/** falling 腿张开速度档（legSpread = min(speed,4)×0.04，取整档避免频繁切 clip） */
export const fallingSpeedTier = (horizontalSpeed: number): number =>
    Math.min(Math.max(Math.round(Math.min(horizontalSpeed, 4)), 0), 4)

/** 基础状态 clip 缓存（按 state + weaponHeld + falling 速度档惰性生成） */
const clipCache = new Map<string, BoneAnimationClip>()

export const getBaseClip = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    horizontalSpeed = 0,
    handedness: Handedness = DEFAULT_HANDEDNESS,
): BoneAnimationClip => {
    const speedKey = state === 'falling' ? `:${fallingSpeedTier(horizontalSpeed)}` : ''
    const key = `${handedness}:${state}:${weaponHeld ? 'w' : 'n'}${speedKey}`
    const cached = clipCache.get(key)
    if (cached !== undefined) return cached
    const clip = buildBaseClip(state, weaponHeld, horizontalSpeed, handedness)
    clipCache.set(key, clip)
    return clip
}

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

/* ── 持握模式感知的完整基础状态 clip（离线预组合：运行时单层播放，零组合开销） ── */
const holdClipCache = new Map<string, BoneAnimationClip>()

/** 按持握模式离线烘焙单个完整 clip；运行时只播放这一层，不做分层加权合成。 */
export const getBaseClipForHoldMode = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    holdMode: HoldMode,
    horizontalSpeed = 0,
    shieldArms: readonly ('right' | 'left')[] = [],
    handedness: Handedness = DEFAULT_HANDEDNESS,
    weaponClassId?: string,
): BoneAnimationClip => {
    const speedKey = state === 'falling' ? `:${fallingSpeedTier(horizontalSpeed)}` : ''
    const shieldKey = shieldArms.length > 0 ? `:s${shieldArms.map(arm => arm[0]).join('')}` : ''
    const weaponKey = weaponHeld && holdMode === 'two_handed' && weaponClassId !== undefined
        ? `:w${weaponClassId}`
        : ''
    const key = `${handedness}:${state}:${weaponHeld ? holdMode : 'n'}${speedKey}${shieldKey}${weaponKey}`
    const cached = holdClipCache.get(key)
    if (cached !== undefined) return cached
    const canonical = buildBaseClipWithJoints(
        state,
        CHARACTER_JOINT_IDS,
        weaponHeld,
        horizontalSpeed,
        weaponHeld ? holdMode : undefined,
        shieldArms,
        DEFAULT_HANDEDNESS,
    )
    const support = weaponHeld && holdMode === 'two_handed' && weaponClassId !== undefined
        ? SUPPORT_HAND_BASE[weaponClassId]?.[state]
        : undefined
    const posable = applySupportHandTracks(canonical, support, CHARACTER_JOINT_REST_POSITIONS)
    const clip = handedness === DEFAULT_HANDEDNESS ? posable : mirrorClip(posable)
    holdClipCache.set(key, clip)
    return clip
}

