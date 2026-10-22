import {Euler, Quaternion} from 'three'
import type {ClipJSON, JointRecordJSON, JointTrackJSON} from '../../../../../skeleton/anim/serialization.ts'
import type {AuthoredAttackClip} from '../../../../../character/weapon/attack_clips/types.ts'
import {CHARACTER_JOINT_IDS, CHARACTER_JOINT_REST_POSITIONS} from './base_clips.ts'

const quatOf = (euler: readonly [number, number, number]): readonly [number, number, number, number] => {
    const q = new Quaternion().setFromEuler(new Euler(euler[0], euler[1], euler[2], 'XYZ'))
    return [q.x, q.y, q.z, q.w]
}

const trackOf = (targetId: string, authored: AuthoredAttackClip): JointTrackJSON => {
    const rotations = authored.joints[targetId]
    const positions = authored.positions?.[targetId]
    if (rotations === undefined) throw new Error(`攻击段作者数据缺少关节 ${targetId}`)
    if (rotations.length !== authored.times.length) {
        throw new Error(`攻击段 ${targetId} 关键帧数量与时间栅格不一致`)
    }
    if (positions !== undefined && positions.length !== authored.times.length) {
        throw new Error(`攻击段 ${targetId} 位置数量与时间栅格不一致`)
    }
    const rest = CHARACTER_JOINT_REST_POSITIONS[targetId as keyof typeof CHARACTER_JOINT_REST_POSITIONS]
    if (rest === undefined) throw new Error(`未知人形关节 ${targetId}`)
    const records: JointRecordJSON[] = authored.times.map((time, index) => {
        const position = positions?.[index] ?? rest
        const rotation = quatOf(rotations[index]!)
        return {
            time,
            position: [position[0], position[1], position[2]],
            rotation: [rotation[0], rotation[1], rotation[2], rotation[3]],
        }
    })
    return {
        targetId,
        interpolation: {type: 'bezier_quad', strategy: 'strike_peak'},
        records,
    }
}

/** 作者格式 → ClipJSON：未声明关节补恒等轨道，随后再由调用方合并支撑手双轨 */
export const compileAttackClip = (name: string, authored: AuthoredAttackClip): ClipJSON => {
    const jointTracks = CHARACTER_JOINT_IDS.map(jointId => {
        if (authored.joints[jointId] !== undefined) return trackOf(jointId, authored)
        const rest = CHARACTER_JOINT_REST_POSITIONS[jointId]
        return {
            targetId: jointId,
            interpolation: {type: 'bezier_quad', strategy: 'strike_peak'} as const,
            records: [
                {
                    time: 0,
                    position: [rest[0], rest[1], rest[2]] as [number, number, number],
                    rotation: [0, 0, 0, 1] as [number, number, number, number],
                },
                {
                    time: authored.duration,
                    position: [rest[0], rest[1], rest[2]] as [number, number, number],
                    rotation: [0, 0, 0, 1] as [number, number, number, number],
                },
            ],
        }
    })
    return {
        name,
        duration: authored.duration,
        loop: authored.loop === true,
        jointTracks,
        boneTracks: [],
        eventTracks: [{
            records: (authored.events ?? []).map(event => ({
                time: event.time,
                eventName: event.name,
                ...(event.weapon !== undefined ? {params: {weapon: event.weapon}} : {}),
            })),
        }],
    }
}
