import {Quaternion, Vector3} from 'three'
import type {BoneAnimationClip, BoneJointKeyframeRecord} from '../../../../../../skeleton/anim/types.ts'
import {mirrorClip} from '../../../../../../skeleton/anim/mirror.ts'
import {DEFAULT_HANDEDNESS, type Handedness} from '../../../../../../character/handedness.ts'
import type {SupportHandTrackData} from './support_hand_merge.ts'
import {CHARACTER_JOINT_REST_POSITIONS} from './rest_pose.ts'

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
    targetId: 'leftArmShoulder' | 'leftArmElbow',
    times: readonly number[],
    rotations: readonly (readonly [number, number, number, number])[],
): {targetId: string; interpolation: {type: 'bezier_quad'; strategy: 'none'}; records: BoneJointKeyframeRecord[]} => {
    const rest = CHARACTER_JOINT_REST_POSITIONS[targetId]
    return {
        targetId,
        interpolation: {type: 'bezier_quad', strategy: 'none'},
        records: times.map((time, index) => {
            const rotation = rotations[index]
            if (rotation === undefined) throw new Error(`支撑手轨道 ${targetId} 缺少第 ${index} 帧`)
            return recordOf(time, rest, rotation)
        }),
    }
}

/** 支撑手双轨数据 → 只含左肩/左肘的 clip；左撇子镜像为目标右臂 */
export const createSupportHandClip = (
    name: string,
    duration: number,
    loop: boolean,
    data: SupportHandTrackData,
    handedness: Handedness = DEFAULT_HANDEDNESS,
): BoneAnimationClip => {
    const clip: BoneAnimationClip = {
        name,
        duration,
        loop,
        jointTracks: [
            trackOf('leftArmShoulder', data.times, data.shoulder),
            trackOf('leftArmElbow', data.times, data.elbow),
        ],
        boneTracks: [],
        eventTracks: [],
    }
    return handedness === DEFAULT_HANDEDNESS ? clip : mirrorClip(clip)
}
