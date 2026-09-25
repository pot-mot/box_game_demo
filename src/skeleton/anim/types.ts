import type {Quaternion, Vector3} from 'three'
import type {TransitionSpec} from '../transition.ts'
import {DEFAULT_TRACK_INTERPOLATION} from '../constants.ts'

/** 骨骼节点关键帧记录（关节局部 pose） */
export interface BoneJointKeyframeRecord {
    readonly time: number
    readonly position: Vector3
    readonly rotation: Quaternion
}

/** 骨骼段关键帧记录：仅 roll。方向/长度是派生值，length 是运行时动态值不参与记录 */
export interface BoneSegmentKeyframeRecord {
    readonly time: number
    readonly roll: number
}

/** 动画事件记录（Godot call method track 思路）：时间点触发命名事件 */
export interface BoneEventRecord {
    readonly time: number
    readonly eventName: string
    readonly params?: Readonly<Record<string, string | number>>
}

/** 轨道（数据真相，Godot 模型）：每目标一条，记录按 time 升序 */
export interface BoneJointTrack {
    readonly targetId: string
    readonly interpolation: TransitionSpec
    readonly records: readonly BoneJointKeyframeRecord[]
}

export interface BoneSegmentTrack {
    readonly targetId: string
    readonly interpolation: TransitionSpec
    readonly records: readonly BoneSegmentKeyframeRecord[]
}

/** 事件轨（不绑定单一目标，按时间排列） */
export interface BoneEventTrack {
    readonly records: readonly BoneEventRecord[]
}

/** 骨骼动画（clip） */
export interface BoneAnimationClip {
    readonly name: string
    readonly duration: number
    readonly loop: boolean
    readonly jointTracks: readonly BoneJointTrack[]
    readonly boneTracks: readonly BoneSegmentTrack[]
    readonly eventTracks: readonly BoneEventTrack[]
}

/**
 * clip 深拷贝：记录的位置/旋转向量与全部数组独立（编辑副本不影响源 clip）。
 * 插值规格与事件记录参数按不可变数据复用（项目内一律以替换而非就地修改的方式更新）。
 */
export const cloneClip = (clip: BoneAnimationClip): BoneAnimationClip => ({
    ...clip,
    jointTracks: clip.jointTracks.map(track => ({
        ...track,
        records: track.records.map(record => ({
            time: record.time,
            position: record.position.clone(),
            rotation: record.rotation.clone(),
        })),
    })),
    boneTracks: clip.boneTracks.map(track => ({...track, records: [...track.records]})),
    eventTracks: clip.eventTracks.map(track => ({...track, records: [...track.records]})),
})

/** 编辑器视图：关键帧聚合（时间点 → 全部目标记录 + 事件），与轨道互转 */
export interface BoneAnimationKeyframe {
    readonly time: number
    readonly jointRecords: readonly {jointId: string; record: BoneJointKeyframeRecord}[]
    readonly boneRecords: readonly {boneId: string; record: BoneSegmentKeyframeRecord}[]
    readonly events: readonly BoneEventRecord[]
}

/**
 * 关键帧聚合 → 轨道。按 targetId 分组并按 time 升序排序；
 * 同一目标同一时间多条记录时保留最后一条；插值规格默认取 DEFAULT_TRACK_INTERPOLATION，
 * 可通过 interpolation 映射覆盖（编辑器按轨道配置传入）。
 */
export const keyframesToTracks = (
    keyframes: readonly BoneAnimationKeyframe[],
    jointInterpolation?: ReadonlyMap<string, TransitionSpec>,
    boneInterpolation?: ReadonlyMap<string, TransitionSpec>,
): {jointTracks: readonly BoneJointTrack[]; boneTracks: readonly BoneSegmentTrack[]; eventTracks: readonly BoneEventTrack[]} => {
    const jointByTarget = new Map<string, BoneJointKeyframeRecord[]>()
    const boneByTarget = new Map<string, BoneSegmentKeyframeRecord[]>()
    const events: BoneEventRecord[] = []

    for (const kf of keyframes) {
        for (const {jointId, record} of kf.jointRecords) {
            const list = jointByTarget.get(jointId) ?? []
            list.push(record)
            jointByTarget.set(jointId, list)
        }
        for (const {boneId, record} of kf.boneRecords) {
            const list = boneByTarget.get(boneId) ?? []
            list.push(record)
            boneByTarget.set(boneId, list)
        }
        events.push(...kf.events)
    }

    const sortRecords = <T extends {time: number}>(records: readonly T[]): readonly T[] =>
        [...records].sort((a, b) => a.time - b.time)

    const jointTracks = [...jointByTarget.entries()].map(([targetId, records]) => ({
        targetId,
        interpolation: jointInterpolation?.get(targetId) ?? DEFAULT_TRACK_INTERPOLATION,
        records: sortRecords(dedupeByTime(records)),
    }))

    const boneTracks = [...boneByTarget.entries()].map(([targetId, records]) => ({
        targetId,
        interpolation: boneInterpolation?.get(targetId) ?? DEFAULT_TRACK_INTERPOLATION,
        records: sortRecords(dedupeByTime(records)),
    }))

    return {jointTracks, boneTracks, eventTracks: [{records: sortRecords(events)}]}
}

/** 同一时间保留最后一条记录 */
const dedupeByTime = <T extends {time: number}>(records: readonly T[]): readonly T[] => {
    const byTime = new Map<number, T>()
    for (const record of records) byTime.set(record.time, record)
    return [...byTime.values()]
}

/** 轨道 → 关键帧聚合：按时间归并全部轨道记录与事件，按 time 升序输出 */
export const tracksToKeyframes = (clip: BoneAnimationClip): readonly BoneAnimationKeyframe[] => {
    const byTime = new Map<number, BoneAnimationKeyframe>()

    const pushJoint = (time: number, jointId: string, record: BoneJointKeyframeRecord): void => {
        const kf = byTime.get(time) ?? {time, jointRecords: [], boneRecords: [], events: []}
        ;(kf.jointRecords as {jointId: string; record: BoneJointKeyframeRecord}[]).push({jointId, record})
        byTime.set(time, kf)
    }
    const pushBone = (time: number, boneId: string, record: BoneSegmentKeyframeRecord): void => {
        const kf = byTime.get(time) ?? {time, jointRecords: [], boneRecords: [], events: []}
        ;(kf.boneRecords as {boneId: string; record: BoneSegmentKeyframeRecord}[]).push({boneId, record})
        byTime.set(time, kf)
    }
    const pushEvent = (record: BoneEventRecord): void => {
        const kf = byTime.get(record.time) ?? {time: record.time, jointRecords: [], boneRecords: [], events: []}
        ;(kf.events as BoneEventRecord[]).push(record)
        byTime.set(record.time, kf)
    }

    for (const track of clip.jointTracks) {
        for (const record of track.records) pushJoint(record.time, track.targetId, record)
    }
    for (const track of clip.boneTracks) {
        for (const record of track.records) pushBone(record.time, track.targetId, record)
    }
    for (const track of clip.eventTracks) {
        for (const record of track.records) pushEvent(record)
    }

    return [...byTime.values()].sort((a, b) => a.time - b.time)
}