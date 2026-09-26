import {Euler, Quaternion, Vector3} from 'three'
import type {BoneAnimationClip, BoneJointKeyframeRecord} from '../../../../skeleton/anim/types.ts'
import type {JointPose} from '../../../../skeleton/skeleton.ts'
import type {PoseLayer} from '../../../../skeleton/anim/composition.ts'
import type {HoldMode} from '../../../../character/weapon/hold_mode.ts'
import {CLIP_SAMPLE_FPS} from '../constants.ts'
import {BASE_CLIP_META, BASE_POSE_SAMPLERS, adjustArmsForHoldMode, type PoseState} from '../pose_fns.ts'
import {
    MODEL_BASE_HEIGHT,
    MODEL_BASE_WIDTH,
    BODY_RATIO,
    LEG_RATIO,
    ARM_X_GAP,
    LEG_X_GAP,
} from '../../../../render/constants.ts'

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

/**
 * 基础状态分层（Q3：一个 state 由多条同时生效的动画组合而成）：
 * - **下半身/体态层**（root + 双腿 + spine + 头部）：步态与前倾/下沉，跨持握模式复用；
 * - **上半身层**（8 个手臂关节）：按持握模式选择手臂姿态。
 * 两层关节不重叠，按关节归一化加权合成后即完整姿态。
 */
export const BASE_LOCOMOTION_JOINTS: readonly CharacterJointId[] = [
    'root',
    'rightLegHip', 'rightLegKnee', 'leftLegHip', 'leftLegKnee',
    'spine', 'headNeck',
]

export const BASE_UPPER_JOINTS: readonly CharacterJointId[] = [
    'rightArmShoulder', 'rightArmElbow', 'rightHandPivot', 'rightWristPivot', 'rightWeaponMount',
    'leftArmShoulder', 'leftArmElbow', 'leftHandPivot', 'leftWristPivot', 'leftWeaponMount',
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
    rightArmShoulder: [REST_SHOULDER_X, REST_BODY_H, 0],
    rightArmElbow: [0, -REST_UPPER_ARM_H, 0],
    rightHandPivot: [0, -REST_UPPER_ARM_H, 0],
    rightWristPivot: [0, 0, 0],
    rightWeaponMount: [0, 0, 0],
    leftArmShoulder: [-REST_SHOULDER_X, REST_BODY_H, 0],
    leftArmElbow: [0, -REST_UPPER_ARM_H, 0],
    leftHandPivot: [0, -REST_UPPER_ARM_H, 0],
    leftWristPivot: [0, 0, 0],
    leftWeaponMount: [0, 0, 0],
    /* 模型原点在脚底：root 直接子关节（双腿髋/spine）位于腿长高度 */
    rightLegHip: [REST_HIP_X, REST_LEG_H, 0],
    rightLegKnee: [0, -REST_HIP_H, 0],
    leftLegHip: [-REST_HIP_X, REST_LEG_H, 0],
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
): BoneAnimationClip => {
    const meta = BASE_CLIP_META[state]
    const sampler = BASE_POSE_SAMPLERS[state]
    const frameCount = Math.max(2, Math.round(meta.duration * CLIP_SAMPLE_FPS) + 1)
    const tracks = jointIds.map(jointId => {
        const records: BoneJointKeyframeRecord[] = []
        for (let i = 0; i < frameCount; i++) {
            const t = meta.duration * i / (frameCount - 1)
            const pose = adjustArmsForHoldMode(sampler(t, {weaponHeld, horizontalSpeed}), holdMode, weaponHeld, state)
            const record = poseToRecord(pose).get(jointId)!
            records.push({time: t, position: record.position, rotation: record.rotation})
        }
        return {
            targetId: jointId,
            /* 关键帧间插值：bezier_quad + none（线性），与旧 lerp 一致 */
            interpolation: {type: 'bezier_quad', strategy: 'none'} as const,
            records,
        }
    })

    return {
        name: `${state}${weaponHeld ? '_held' : ''}`,
        duration: meta.duration,
        loop: meta.loop,
        jointTracks: tracks,
        boneTracks: [],
        eventTracks: [],
    }
}

/** 完整基础状态 clip（编辑器动画库 / 兼容全骨架播放） */
export const buildBaseClip = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    horizontalSpeed = 0,
): BoneAnimationClip =>
    buildBaseClipWithJoints(state, CHARACTER_JOINT_IDS, weaponHeld, horizontalSpeed, undefined)

/** falling 腿张开速度档（legSpread = min(speed,4)×0.04，取整档避免频繁切 clip） */
export const fallingSpeedTier = (horizontalSpeed: number): number =>
    Math.min(Math.max(Math.round(Math.min(horizontalSpeed, 4)), 0), 4)

/** 基础状态 clip 缓存（按 state + weaponHeld + falling 速度档惰性生成） */
const clipCache = new Map<string, BoneAnimationClip>()

export const getBaseClip = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    horizontalSpeed = 0,
): BoneAnimationClip => {
    const speedKey = state === 'falling' ? `:${fallingSpeedTier(horizontalSpeed)}` : ''
    const key = `${state}:${weaponHeld ? 'w' : 'n'}${speedKey}`
    const cached = clipCache.get(key)
    if (cached !== undefined) return cached
    const clip = buildBaseClip(state, weaponHeld, horizontalSpeed)
    clipCache.set(key, clip)
    return clip
}

/* ── 分层 clip 缓存（下半身与上半身分别缓存；上半身按持握模式） ── */
const lowerClipCache = new Map<string, BoneAnimationClip>()
const upperClipCache = new Map<string, BoneAnimationClip>()

const getLowerClip = (state: keyof typeof BASE_POSE_SAMPLERS, horizontalSpeed: number): BoneAnimationClip => {
    const speedKey = state === 'falling' ? `:${fallingSpeedTier(horizontalSpeed)}` : ''
    const key = `${state}${speedKey}`
    const cached = lowerClipCache.get(key)
    if (cached !== undefined) return cached
    const clip = buildBaseClipWithJoints(state, BASE_LOCOMOTION_JOINTS, false, horizontalSpeed, undefined)
    lowerClipCache.set(key, clip)
    return clip
}

const getUpperClip = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    holdMode: HoldMode | undefined,
    horizontalSpeed: number,
): BoneAnimationClip => {
    const key = `${state}:${weaponHeld ? holdMode ?? 'held' : 'n'}`
    const cached = upperClipCache.get(key)
    if (cached !== undefined) return cached
    const clip = buildBaseClipWithJoints(state, BASE_UPPER_JOINTS, weaponHeld, horizontalSpeed, weaponHeld ? holdMode : undefined)
    upperClipCache.set(key, clip)
    return clip
}

/**
 * 基础状态的组合层：下半身/体态层（跨持握模式复用）+ 上半身层（按持握模式选择）。
 * 两层关节不重叠，按关节归一化加权即还原完整姿态 —— 即「一个 state 对应多条同时生效的动画」。
 */
export const getBaseLayers = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    holdMode: HoldMode,
    horizontalSpeed = 0,
): readonly PoseLayer[] => [
    {clip: getLowerClip(state, horizontalSpeed), weight: 1, progress: 0},
    {clip: getUpperClip(state, weaponHeld, holdMode, horizontalSpeed), weight: 1, progress: 0},
]

/* ── 持握模式感知的完整基础状态 clip（离线预组合：运行时单层播放，零组合开销） ── */
const holdClipCache = new Map<string, BoneAnimationClip>()

/**
 * 均匀权重下，分层组合（`getBaseLayers`，下半身 + 上半身，关节不重叠）与单层全身姿态等价：
 * 这里离线烘焙为**单个完整 clip**（按持握模式调整手臂），运行时按单 clip 播放即可，
 * 避免每帧对两层分别采样 + 合成。需要运行时动态权重/多来源组合时用 `getBaseLayers` + `composePoses`。
 */
export const getBaseClipForHoldMode = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
    holdMode: HoldMode,
    horizontalSpeed = 0,
): BoneAnimationClip => {
    const speedKey = state === 'falling' ? `:${fallingSpeedTier(horizontalSpeed)}` : ''
    const key = `${state}:${weaponHeld ? holdMode : 'n'}${speedKey}`
    const cached = holdClipCache.get(key)
    if (cached !== undefined) return cached
    const clip = buildBaseClipWithJoints(
        state,
        CHARACTER_JOINT_IDS,
        weaponHeld,
        horizontalSpeed,
        weaponHeld ? holdMode : undefined,
    )
    holdClipCache.set(key, clip)
    return clip
}