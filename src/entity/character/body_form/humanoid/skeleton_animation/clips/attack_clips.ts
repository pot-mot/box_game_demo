import type {BoneAnimationClip} from '../../../../../../skeleton/anim/types.ts'
import {mirrorClip} from '../../../../../../skeleton/anim/mirror.ts'
import {DEFAULT_HANDEDNESS, type Handedness} from '../../../../../../character/handedness.ts'
import {compileAuthoredAttackClip} from '../../../common/skeleton_animation/authored_attack.ts'
import {buildCharacterSkeletonDefinition} from '../../skeleton/skeleton.ts'
import {ATTACK_CLIPS} from '../attack_clips/index.ts'
import {applySupportHandTracks} from './support_hand_merge.ts'
import {createSupportHandClip} from './support_hand_clip.ts'
import {SUPPORT_HAND_ATTACKS} from './generated/support_hand_attacks.ts'
import {CHARACTER_JOINT_IDS, CHARACTER_JOINT_REST_POSITIONS} from './rest_pose.ts'

/**
 * 攻击动画解析：段 id → 显式骨骼关键帧 clip。
 * 作者数据按武器拆分（`entity/character/body_form/humanoid/skeleton_animation/attack_clips/`），支撑手轨来自离线生成数据；
 * 解析结果惰性缓存（按段 id + 惯用手复用同一 clip 实例）。
 */

const HUMANOID_ATTACK_SKELETON = buildCharacterSkeletonDefinition()
const cache = new Map<string, BoneAnimationClip>()

const resolveClip = (clipId: string, handedness: Handedness): BoneAnimationClip => {
    const key = handedness === DEFAULT_HANDEDNESS ? clipId : `${handedness}:${clipId}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    const authored = ATTACK_CLIPS[clipId]
    if (authored === undefined) {
        throw new Error(`攻击动画数据缺失：${clipId}（段 id 必须在 attack_clips/ 中有对应作者数据）`)
    }
    const base = applySupportHandTracks(
        compileAuthoredAttackClip(clipId, authored, HUMANOID_ATTACK_SKELETON, CHARACTER_JOINT_IDS),
        SUPPORT_HAND_ATTACKS[clipId],
        CHARACTER_JOINT_REST_POSITIONS,
    )
    const clip = handedness === DEFAULT_HANDEDNESS ? base : mirrorClip(base)
    cache.set(key, clip)
    return clip
}

/** 取段 id 对应的攻击动画 clip；数据缺失时抛错（表示作者数据与武器段不同步） */
export const getAttackClipById = (clipId: string, handedness: Handedness = DEFAULT_HANDEDNESS): BoneAnimationClip =>
    resolveClip(clipId, handedness)

const bodyCache = new Map<string, BoneAnimationClip>()

/** 攻击身体 clip：不含支撑手合并（支撑手由独立组合层提供） */
export const getAttackBodyClipById = (clipId: string, handedness: Handedness = DEFAULT_HANDEDNESS): BoneAnimationClip => {
    const key = handedness === DEFAULT_HANDEDNESS ? clipId : `${handedness}:${clipId}`
    const cached = bodyCache.get(key)
    if (cached !== undefined) return cached
    const authored = ATTACK_CLIPS[clipId]
    if (authored === undefined) {
        throw new Error(`攻击动画数据缺失：${clipId}（段 id 必须在 attack_clips/ 中有对应作者数据）`)
    }
    const body = compileAuthoredAttackClip(clipId, authored, HUMANOID_ATTACK_SKELETON, CHARACTER_JOINT_IDS)
    const clip = handedness === DEFAULT_HANDEDNESS ? body : mirrorClip(body)
    bodyCache.set(key, clip)
    return clip
}

const supportCache = new Map<string, BoneAnimationClip>()

/** 攻击支撑手独立 clip（只含左肩/左肘；无数据返回 undefined） */
export const getAttackSupportHandClip = (
    clipId: string,
    handedness: Handedness = DEFAULT_HANDEDNESS,
): BoneAnimationClip | undefined => {
    const data = SUPPORT_HAND_ATTACKS[clipId]
    if (data === undefined) return undefined
    const key = handedness === DEFAULT_HANDEDNESS ? clipId : `${handedness}:${clipId}`
    const cached = supportCache.get(key)
    if (cached !== undefined) return cached
    const duration = getAttackBodyClipById(clipId).duration
    const clip = createSupportHandClip(`support_attack_${clipId}`, duration, false, data, handedness)
    supportCache.set(key, clip)
    return clip
}
