import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {Euler, Quaternion} from 'three'
import {clipFromJSON, type ClipJSON} from '../../../../skeleton/anim/serialization.ts'
import {mirrorClip} from '../../../../skeleton/anim/mirror.ts'
import {DEFAULT_HANDEDNESS, type Handedness} from '../../../../character/handedness.ts'
import {ATTACK_CLIP_JSON} from '../../../../character/weapon/attack_clip_data.ts'
import {ATTACK_POSE_EDITS} from '../../../../character/weapon/attack_pose_edits.ts'
import {bakeTwoHandedSupportHand} from './support_hand_bake.ts'

/**
 * 攻击动画解析：段 id → 显式骨骼关键帧 clip。
 * 动画数据是武器模组侧的稀疏关键帧（`attack_clip_data.ts` + 显式逐段修订 `attack_pose_edits.ts`），
 * 不再由抽象动画参数在运行时生成。解析结果惰性缓存（按段 id 复用同一 clip 实例）。
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
    handedness: Handedness,
    source: Readonly<Record<string, ClipJSON>>,
    edits: Readonly<Record<string, readonly PoseEdit[]>>,
    missingMessage: string,
): BoneAnimationClip => {
    /* 缓存键含惯用手：canonical（右撇子）原始 clip 与镜像变体分别缓存 */
    const key = handedness === DEFAULT_HANDEDNESS ? clipId : `${handedness}:${clipId}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    const raw = source[clipId]
    if (raw === undefined) throw new Error(missingMessage)
    /* 双手共持：先把副手轨迹烘焙成显式关键帧（首帧解析时一次性完成，播放时零 IK 开销） */
    const base = bakeTwoHandedSupportHand(
        clipId,
        clipFromJSON(applyPoseEdits(clipId, raw, edits[clipId])),
    )
    /* 左撇子：对 canonical clip 施加矢状面反射（左右关节互换 + 旋转共轭），离线烘焙零运行时开销 */
    const clip = handedness === DEFAULT_HANDEDNESS ? base : mirrorClip(base)
    cache.set(key, clip)
    return clip
}

/** 取段 id 对应的攻击动画 clip；数据缺失时抛错（表示烘焙数据与武器段不同步） */
export const getAttackClipById = (clipId: string, handedness: Handedness = DEFAULT_HANDEDNESS): BoneAnimationClip =>
    resolveClip(clipId, handedness, ATTACK_CLIP_JSON, ATTACK_POSE_EDITS, `攻击动画数据缺失：${clipId}（段 id 必须在 attack_clip_data.ts 中有对应关键帧）`)
