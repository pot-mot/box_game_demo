import {Euler, Quaternion, Vector3} from 'three'
import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'
import type {BoneAnimationClip, BoneEventTrack, BoneJointTrack} from '../../../../../skeleton/anim/types.ts'

/** 作者格式：关节局部 XYZ 欧拉角（弧度） */
export type AuthoredEuler = readonly [number, number, number]

export interface AuthoredAttackEvent {
    readonly time: number
    readonly name: 'hitbox_on' | 'hitbox_off'
    /** 命中窗口归属槽位键（`kind:bodyPart`，如 `weapon:main_hand` / `weapon:off_hand`） */
    readonly slotKey?: string
}

/** 攻击段作者数据：clip 级时间栅格 + 每关节欧拉角列 + 可选位置覆盖 + 事件 */
export interface AuthoredAttackClip {
    readonly duration: number
    readonly loop?: boolean
    readonly times: readonly number[]
    readonly joints: Readonly<Record<string, readonly AuthoredEuler[]>>
    readonly positions?: Readonly<Record<string, readonly (readonly [number, number, number])[]>>
    readonly events?: readonly AuthoredAttackEvent[]
}

const AUTHORED_ATTACK_INTERPOLATION = {type: 'bezier_quad', strategy: 'strike_peak'} as const

const quatOf = (euler: AuthoredEuler): Quaternion =>
    new Quaternion().setFromEuler(new Euler(euler[0], euler[1], euler[2], 'XYZ'))

interface AuthoredJointRest {
    readonly position: readonly [number, number, number]
}

/**
 * 作者格式 → 运行时 clip（跨体形通用）。
 *
 * 只编译作者显式声明的关节；未声明关节的语义是「本段不控制它」，
 * 由运行时在进入攻击姿态时恢复骨架静止姿态。编译器不得补恒等轨道。
 */
export const compileAuthoredAttackClip = (
    name: string,
    authored: AuthoredAttackClip,
    skeleton: SkeletonDefinition,
    jointIds?: readonly string[],
): BoneAnimationClip => {
    const restById = new Map<string, AuthoredJointRest>()
    for (const joint of skeleton.joints) {
        if (jointIds === undefined || jointIds.includes(joint.id)) {
            restById.set(joint.id, {position: joint.position})
        }
    }

    for (const jointId of Object.keys(authored.joints)) {
        if (!restById.has(jointId)) throw new Error(`攻击段 ${name} 引用了当前骨架不存在的关节 ${jointId}`)
    }
    for (const jointId of Object.keys(authored.positions ?? {})) {
        if (!restById.has(jointId)) throw new Error(`攻击段 ${name} 的位置覆盖引用了当前骨架不存在的关节 ${jointId}`)
    }

    const jointTracks: BoneJointTrack[] = []
    for (const [targetId, rotations] of Object.entries(authored.joints)) {
        if (rotations.length !== authored.times.length) {
            throw new Error(`攻击段 ${name}/${targetId} 关键帧数量与时间栅格不一致`)
        }
        const positions = authored.positions?.[targetId]
        if (positions !== undefined && positions.length !== authored.times.length) {
            throw new Error(`攻击段 ${name}/${targetId} 位置数量与时间栅格不一致`)
        }
        const rest = restById.get(targetId)
        if (rest === undefined) continue
        const records = authored.times.map((time, index) => {
            const position = positions?.[index] ?? rest.position
            const rotation = quatOf(rotations[index]!)
            return {
                time,
                position: new Vector3(position[0], position[1], position[2]),
                rotation,
            }
        })
        jointTracks.push({
            targetId,
            interpolation: AUTHORED_ATTACK_INTERPOLATION,
            records,
        })
    }

    const eventTracks: BoneEventTrack[] = [{
        records: (authored.events ?? []).map(event => ({
            time: event.time,
            eventName: event.name,
            ...(event.slotKey !== undefined ? {params: {slotKey: event.slotKey}} : {}),
        })),
    }]

    return {
        name,
        duration: authored.duration,
        loop: authored.loop === true,
        jointTracks,
        boneTracks: [],
        eventTracks,
    }
}
