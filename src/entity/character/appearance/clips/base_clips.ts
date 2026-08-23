import {Euler, Quaternion, Vector3} from 'three'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {BASE_CLIP_META, BASE_POSE_SAMPLERS, type PoseState} from '../pose_fns.ts'
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
    'rightWristPivot',
    'leftArmShoulder',
    'leftArmElbow',
    'rightLegHip',
    'rightLegKnee',
    'leftLegHip',
    'leftLegKnee',
    'headNeck',
    'spine',
    'group',
] as const

export type CharacterJointId = typeof CHARACTER_JOINT_IDS[number]

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
    rightWristPivot: [0, 0, 0],
    leftArmShoulder: [-REST_SHOULDER_X, REST_BODY_H, 0],
    leftArmElbow: [0, -REST_UPPER_ARM_H, 0],
    rightLegHip: [REST_HIP_X, 0, 0],
    rightLegKnee: [0, -REST_HIP_H, 0],
    leftLegHip: [-REST_HIP_X, 0, 0],
    leftLegKnee: [0, -REST_HIP_H, 0],
    headNeck: [0, REST_BODY_H, 0],
    spine: [0, 0, 0],
    group: [0, 0, 0],
}

/** 采样率（fps）：关键帧密度，插值误差 < 1% 波幅 */
const SAMPLE_FPS = 60

const eulerOf = (state: {rx: number; ry: number; rz: number}): Euler => new Euler(state.rx, state.ry, state.rz)

/** 关节静止位置（动画只改旋转；spine 例外，spine.position 有前倾/下沉动画） */
const restPositionOf = (jointId: CharacterJointId): Vector3 =>
    new Vector3().fromArray([...CHARACTER_JOINT_REST_POSITIONS[jointId]])

const poseToRecord = (pose: PoseState): ReadonlyMap<CharacterJointId, {position: Vector3; rotation: Quaternion}> => {
    const map = new Map<CharacterJointId, {position: Vector3; rotation: Quaternion}>()
    const set = (jointId: CharacterJointId, rotation: {rx: number; ry: number; rz: number}, position: Vector3 = restPositionOf(jointId)): void => {
        map.set(jointId, {position, rotation: new Quaternion().setFromEuler(eulerOf(rotation))})
    }
    set('rightArmShoulder', pose.rightArmShoulder)
    set('rightArmElbow', pose.rightArmElbow)
    set('rightWristPivot', pose.rightWristPivot)
    set('leftArmShoulder', pose.leftArmShoulder)
    set('leftArmElbow', pose.leftArmElbow)
    set('rightLegHip', pose.rightLegHip)
    set('rightLegKnee', pose.rightLegKnee)
    set('leftLegHip', pose.leftLegHip)
    set('leftLegKnee', pose.leftLegKnee)
    set('headNeck', pose.headNeck)
    set('spine', pose.spine.rotation, new Vector3().fromArray([...pose.spine.position]))
    set('group', pose.group.rotation)
    return map
}

/**
 * 基础状态 clip 生成器：按固定采样率烘焙姿态公式为关键帧（运行时纯 clip 播放，无程序化 modifier）。
 * 循环动画采样 [0, duration]（含末帧，wrap 无缝由采样器处理）；非循环采样全程。
 */
export const buildBaseClip = (
    state: keyof typeof BASE_POSE_SAMPLERS,
    weaponHeld: boolean,
): BoneAnimationClip => {
    const meta = BASE_CLIP_META[state]
    const sampler = BASE_POSE_SAMPLERS[state]
    const frameCount = Math.max(2, Math.round(meta.duration * SAMPLE_FPS) + 1)
    const tracks = CHARACTER_JOINT_IDS.map(jointId => {
        const records: {time: number; position: Vector3; rotation: Quaternion}[] = []
        for (let i = 0; i < frameCount; i++) {
            const t = meta.duration * i / (frameCount - 1)
            const record = poseToRecord(sampler(t, {weaponHeld})).get(jointId)!
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

/** 基础状态 clip 缓存（按 state + weaponHeld 惰性生成） */
const clipCache = new Map<string, BoneAnimationClip>()

export const getBaseClip = (state: keyof typeof BASE_POSE_SAMPLERS, weaponHeld: boolean): BoneAnimationClip => {
    const key = `${state}:${weaponHeld ? 'w' : 'n'}`
    const cached = clipCache.get(key)
    if (cached !== undefined) return cached
    const clip = buildBaseClip(state, weaponHeld)
    clipCache.set(key, clip)
    return clip
}