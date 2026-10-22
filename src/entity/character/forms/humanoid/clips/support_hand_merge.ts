import {Quaternion, Vector3} from 'three'
import type {BoneAnimationClip, BoneJointKeyframeRecord, BoneJointTrack} from '../../../../../skeleton/anim/types.ts'

/** 支撑手双轨（canonical 右撇子：左肩 / 左肘） */
export interface SupportHandTrackData {
    readonly times: readonly number[]
    readonly shoulder: readonly (readonly [number, number, number, number])[]
    readonly elbow: readonly (readonly [number, number, number, number])[]
}

export type SupportHandTable = Readonly<Record<string, Readonly<Record<string, SupportHandTrackData>>>>

const SUPPORT_SHOULDER_ID = 'leftArmShoulder'
const SUPPORT_ELBOW_ID = 'leftArmElbow'

const recordOf = (
    time: number,
    position: readonly [number, number, number],
    rotation: readonly [number, number, number, number],
): BoneJointKeyframeRecord => ({
    time,
    position: new Vector3().fromArray([...position]),
    rotation: new Quaternion().fromArray([...rotation]),
})

const trackOf = (
    targetId: string,
    data: SupportHandTrackData,
    rotations: readonly (readonly [number, number, number, number])[],
    restPosition: readonly [number, number, number],
): BoneJointTrack => ({
    targetId,
    interpolation: {type: 'linear'},
    records: data.times.map((time, index) => recordOf(time, restPosition, rotations[index]!)),
})

/** 把预烘焙支撑手双轨合并进 clip；缺数据时原样返回 */
export const applySupportHandTracks = (
    clip: BoneAnimationClip,
    data: SupportHandTrackData | undefined,
    restPositions: Readonly<Record<string, readonly [number, number, number]>>,
): BoneAnimationClip => {
    if (data === undefined) return clip
    const shoulderRest = restPositions[SUPPORT_SHOULDER_ID]
    const elbowRest = restPositions[SUPPORT_ELBOW_ID]
    if (shoulderRest === undefined || elbowRest === undefined) return clip
    const merged = new Map(clip.jointTracks.map(track => [track.targetId, track]))
    merged.set(SUPPORT_SHOULDER_ID, trackOf(SUPPORT_SHOULDER_ID, data, data.shoulder, shoulderRest))
    merged.set(SUPPORT_ELBOW_ID, trackOf(SUPPORT_ELBOW_ID, data, data.elbow, elbowRest))
    return {...clip, jointTracks: [...merged.values()]}
}
