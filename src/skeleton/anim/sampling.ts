import type {JointPose, SkeletonPose} from '../skeleton.ts'
import {lerpNumber, lerpQuat, lerpVec3, applyTransition} from '../transition.ts'
import type {
    BoneEventRecord,
    BoneEventTrack,
    BoneJointTrack,
    BoneAnimationClip,
    BoneSegmentTrack,
} from './types.ts'

interface Segment<T> {
    readonly prev: T
    readonly next: T
    /** 未缓动的线性进度 0-1 */
    readonly p: number
}

/**
 * 定位 time 前后相邻记录（含 wrap/clamp 语义）：
 * - 循环时先把 time 归一化到 [0, duration) 周期内，再处理「末帧 → 首帧」wrap（p 恒在 [0,1)）；
 * - 非循环：t 越界时返回最近记录（nearest 语义，p = 0）。
 */
const findSegment = <T extends {time: number}>(
    records: readonly T[],
    time: number,
    loop: boolean,
    duration: number,
): Segment<T> | undefined => {
    if (records.length === 0) return undefined
    if (records.length === 1) return {prev: records[0], next: records[0], p: 0}

    const t = loop && duration > 0 ? ((time % duration) + duration) % duration : time

    let prev: T | undefined
    let next: T | undefined
    for (const record of records) {
        if (record.time <= t) prev = record
        else if (next === undefined) next = record
    }

    if (prev !== undefined && next !== undefined) {
        const span = next.time - prev.time
        return {prev, next, p: span > 0 ? (t - prev.time) / span : 0}
    }
    if (prev !== undefined) {
        /* t >= 末帧 */
        if (loop && duration > 0) {
            const first = records[0]
            const span = first.time + duration - prev.time
            return {prev, next: first, p: span > 0 ? (t - prev.time) / span : 0}
        }
        return {prev, next: prev, p: 0}
    }
    /* t < 首帧 */
    if (loop && duration > 0) {
        const last = records[records.length - 1]
        const first = records[0]
        const span = first.time + duration - last.time
        return {prev: last, next: first, p: span > 0 ? (t + duration - last.time) / span : 0}
    }
    return {prev: records[0], next: records[0], p: 0}
}

/** 采样关节轨道：返回插值后的局部 pose；无记录返回 undefined（非循环越界 = clamp 到最近记录） */
export const sampleJointTrack = (
    track: BoneJointTrack,
    time: number,
    loop = false,
    duration = 0,
): JointPose | undefined => {
    const segment = findSegment(track.records, time, loop, duration)
    if (segment === undefined) return undefined
    const eased = applyTransition(segment.p, track.interpolation)
    return {
        position: lerpVec3(segment.prev.position, segment.next.position, eased),
        rotation: lerpQuat(segment.prev.rotation, segment.next.rotation, eased),
    }
}

/** 采样骨骼段轨道：返回插值后的 roll；无记录返回 undefined */
export const sampleSegmentTrack = (
    track: BoneSegmentTrack,
    time: number,
    loop = false,
    duration = 0,
): {roll: number} | undefined => {
    const segment = findSegment(track.records, time, loop, duration)
    if (segment === undefined) return undefined
    const eased = applyTransition(segment.p, track.interpolation)
    return {roll: lerpNumber(segment.prev.roll, segment.next.roll, eased)}
}

/** 采样整段 clip 为骨架姿态：循环时 time 取模，非循环时夹取到 duration */
export const sampleClip = (clip: BoneAnimationClip, time: number): SkeletonPose => {
    const t = clip.loop && clip.duration > 0
        ? ((time % clip.duration) + clip.duration) % clip.duration
        : Math.min(time, clip.duration)

    const jointPoses = new Map<string, JointPose>()
    for (const track of clip.jointTracks) {
        const sampled = sampleJointTrack(track, t, clip.loop, clip.duration)
        if (sampled !== undefined) jointPoses.set(track.targetId, sampled)
    }
    const boneRolls = new Map<string, number>()
    for (const track of clip.boneTracks) {
        const sampled = sampleSegmentTrack(track, t, clip.loop, clip.duration)
        if (sampled !== undefined) boneRolls.set(track.targetId, sampled.roll)
    }
    return {jointPoses, boneRolls}
}

/** 查询 (fromTime, toTime] 区间内的事件记录（左开右闭；调用方需保证 from <= to 且 to <= duration） */
export const sampleEvents = (
    clip: BoneAnimationClip,
    fromTime: number,
    toTime: number,
): readonly BoneEventRecord[] => {
    if (toTime <= fromTime) return []
    const out: BoneEventRecord[] = []
    const collect = (track: BoneEventTrack): void => {
        for (const record of track.records) {
            if (record.time > fromTime && record.time <= toTime) {
                out.push(record)
            }
        }
    }
    for (const track of clip.eventTracks) collect(track)
    return out
}