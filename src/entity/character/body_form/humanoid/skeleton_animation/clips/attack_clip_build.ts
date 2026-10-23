import {Euler, Quaternion} from 'three'
import type {ClipJSON, JointRecordJSON, JointTrackJSON} from '../../../../../../skeleton/anim/serialization.ts'
import type {AuthoredAttackClip} from '../../../../../../entity/character/body_form/humanoid/skeleton_animation/attack_clips/types.ts'
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

/**
 * 作者格式 → ClipJSON：只编译作者显式声明的关节。
 *
 * 未声明关节的语义是「本段不控制它」，由播放器在进入攻击姿态时恢复骨架静止姿态；
 * 编译器不得补恒等轨道，否则会伪造作者意图并让「全关节覆盖」测试恒真。
 *
 * `jointIds` 为当前（含装备贡献的）骨架关节集合，用于 fail loudly 校验作者数据。
 */
export const compileAttackClip = (
    name: string,
    authored: AuthoredAttackClip,
    jointIds: readonly string[] = CHARACTER_JOINT_IDS,
): ClipJSON => {
    const known = new Set(jointIds)
    for (const jointId of Object.keys(authored.joints)) {
        if (!known.has(jointId)) throw new Error(`攻击段 ${name} 引用了当前骨架不存在的关节 ${jointId}`)
    }
    for (const jointId of Object.keys(authored.positions ?? {})) {
        if (!known.has(jointId)) throw new Error(`攻击段 ${name} 的位置覆盖引用了当前骨架不存在的关节 ${jointId}`)
    }
    const jointTracks = Object.keys(authored.joints).map(jointId => trackOf(jointId, authored))
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
                ...(event.slotKey !== undefined ? {params: {slotKey: event.slotKey}} : {}),
            })),
        }],
    }
}
