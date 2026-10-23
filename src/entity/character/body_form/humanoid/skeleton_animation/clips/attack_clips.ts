import type {BoneAnimationClip} from '../../../../../../skeleton/anim/types.ts'
import {clipFromJSON} from '../../../../../../skeleton/anim/serialization.ts'
import {mirrorClip} from '../../../../../../skeleton/anim/mirror.ts'
import {DEFAULT_HANDEDNESS, type Handedness} from '../../../../../../character/handedness.ts'
import {ATTACK_CLIPS} from '../attack_clips/index.ts'
import {compileAttackClip} from './attack_clip_build.ts'
import {applySupportHandTracks} from './support_hand_merge.ts'
import {SUPPORT_HAND_ATTACKS} from './generated/support_hand_attacks.ts'
import {CHARACTER_JOINT_IDS, CHARACTER_JOINT_REST_POSITIONS} from './base_clips.ts'

/**
 * 攻击动画解析：段 id → 显式骨骼关键帧 clip。
 * 作者数据按武器拆分（`entity/character/body_form/humanoid/skeleton_animation/attack_clips/`），支撑手轨来自离线生成数据；
 * 解析结果惰性缓存（按段 id + 惯用手复用同一 clip 实例）。
 */

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
        clipFromJSON(compileAttackClip(clipId, authored, CHARACTER_JOINT_IDS)),
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
