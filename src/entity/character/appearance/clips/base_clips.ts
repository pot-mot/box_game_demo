import {Euler, Quaternion, Vector3} from 'three'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {BASE_CLIP_META, BASE_POSE_SAMPLERS, type PoseState} from '../pose_fns.ts'

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

/** 采样率（fps）：关键帧密度，插值误差 < 1% 波幅 */
const SAMPLE_FPS = 60

const eulerOf = (state: {rx: number; ry: number; rz: number}): Euler => new Euler(state.rx, state.ry, state.rz)

const poseToRecord = (pose: PoseState): ReadonlyMap<CharacterJointId, {position: Vector3; rotation: Quaternion}> => {
    const map = new Map<CharacterJointId, {position: Vector3; rotation: Quaternion}>()
    map.set('rightArmShoulder', {position: new Vector3(), rotation: new Quaternion().setFromEuler(eulerOf(pose.rightArmShoulder))})
    map.set('rightArmElbow', {position: new Vector3(), rotation: new Quaternion().setFromEuler(eulerOf(pose.rightArmElbow))})
    map.set('rightWristPivot', {position: new Vector3(), rotation: new Quaternion().setFromEuler(eulerOf(pose.rightWristPivot))})
    map.set('leftArmShoulder', {position: new Vector3(), rotation: new Quaternion().setFromEuler(eulerOf(pose.leftArmShoulder))})
    map.set('leftArmElbow', {position: new Vector3(), rotation: new Quaternion().setFromEuler(eulerOf(pose.leftArmElbow))})
    map.set('rightLegHip', {position: new Vector3(), rotation: new Quaternion().setFromEuler(eulerOf(pose.rightLegHip))})
    map.set('rightLegKnee', {position: new Vector3(), rotation: new Quaternion().setFromEuler(eulerOf(pose.rightLegKnee))})
    map.set('leftLegHip', {position: new Vector3(), rotation: new Quaternion().setFromEuler(eulerOf(pose.leftLegHip))})
    map.set('leftLegKnee', {position: new Vector3(), rotation: new Quaternion().setFromEuler(eulerOf(pose.leftLegKnee))})
    map.set('headNeck', {position: new Vector3(), rotation: new Quaternion().setFromEuler(eulerOf(pose.headNeck))})
    map.set('spine', {position: new Vector3().fromArray([...pose.spine.position]), rotation: new Quaternion().setFromEuler(eulerOf(pose.spine.rotation))})
    map.set('group', {position: new Vector3(), rotation: new Quaternion().setFromEuler(eulerOf(pose.group.rotation))})
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