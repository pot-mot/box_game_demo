import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {Euler, Quaternion} from 'three'
import {clipFromJSON, type ClipJSON} from '../../../../skeleton/anim/serialization.ts'
import {ATTACK_CLIP_JSON} from '../../../../character/weapon/attack_clip_data.ts'
import {ATTACK_POSE_EDITS} from '../../../../character/weapon/attack_pose_edits.ts'
import {CHARGE_CLIP_JSON} from '../../../../character/weapon/charge_clip_data.ts'
import {CHARGE_POSE_EDITS} from '../../../../character/weapon/charge_pose_edits.ts'

/**
 * 攻击动画解析：段 id → 显式骨骼关键帧 clip。
 * 动画数据是武器模组侧的稀疏关键帧（`attack_clip_data.ts` + 显式逐段修订 `attack_pose_edits.ts`），
 * 不再由抽象动画参数在运行时生成。解析结果惰性缓存（按段 id 复用同一 clip 实例）。
 * 专用蓄力姿势 clip（`charge_clip_data.ts` + `charge_pose_edits.ts`）走同一套解析与修订管线。
 */

const cache = new Map<string, BoneAnimationClip>()

type PoseEdit = {readonly time: number; readonly joints: Readonly<Record<string, readonly [number, number, number]>>}

const applyPoseEdits = (clipId: string, raw: ClipJSON, edits: readonly PoseEdit[] | undefined): ClipJSON => {
    if (edits === undefined) return raw

    for (const edit of edits) {
        for (const jointId of Object.keys(edit.joints)) {
            const track = raw.jointTracks.find(candidate => candidate.targetId === jointId)
            if (track === undefined || !track.records.some(record => record.time === edit.time)) {
                throw new Error(`攻击动作关键帧修订无效：${clipId} / ${jointId} @ ${edit.time}`)
            }
        }
    }

    const jointTracks = raw.jointTracks.map(track => ({
        ...track,
        records: track.records.map(record => {
            const pose = edits.find(edit => edit.time === record.time)?.joints[track.targetId]
            if (pose === undefined) return record
            const rotation = new Quaternion().setFromEuler(new Euler(pose[0], pose[1], pose[2], 'XYZ'))
            const quaternion: [number, number, number, number] = [rotation.x, rotation.y, rotation.z, rotation.w]
            return {...record, rotation: quaternion}
        }),
    }))
    return {...raw, jointTracks}
}

const resolveClip = (
    clipId: string,
    source: Readonly<Record<string, ClipJSON>>,
    edits: Readonly<Record<string, readonly PoseEdit[]>>,
    missingMessage: string,
): BoneAnimationClip => {
    const cached = cache.get(clipId)
    if (cached !== undefined) return cached
    const raw = source[clipId]
    if (raw === undefined) throw new Error(missingMessage)
    const clip = clipFromJSON(applyPoseEdits(clipId, raw, edits[clipId]))
    cache.set(clipId, clip)
    return clip
}

/** 取段 id 对应的攻击动画 clip；数据缺失时抛错（表示烘焙数据与武器段不同步） */
export const getAttackClipById = (clipId: string): BoneAnimationClip =>
    resolveClip(clipId, ATTACK_CLIP_JSON, ATTACK_POSE_EDITS, `攻击动画数据缺失：${clipId}（段 id 必须在 attack_clip_data.ts 中有对应关键帧）`)

/** 取专用蓄力姿势 clip；数据缺失时抛错 */
export const getChargeClipById = (clipId: string): BoneAnimationClip =>
    resolveClip(clipId, CHARGE_CLIP_JSON, CHARGE_POSE_EDITS, `蓄力姿势数据缺失：${clipId}（必须在 charge_clip_data.ts 中有对应关键帧）`)
