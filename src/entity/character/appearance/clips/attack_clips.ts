import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import {clipFromJSON} from '../../../../skeleton/anim/serialization.ts'
import {ATTACK_CLIP_JSON} from '../../../../character/weapon/attack_clip_data.ts'

/**
 * 攻击动画解析：段 id → 显式骨骼关键帧 clip。
 * 动画数据是武器模组侧的稀疏关键帧（`character/weapon/attack_clip_data.ts`，由骨骼动画系统播放），
 * 不再由抽象动画参数在运行时生成。解析结果惰性缓存（按段 id 复用同一 clip 实例）。
 */

const cache = new Map<string, BoneAnimationClip>()

/** 取段 id 对应的攻击动画 clip；数据缺失时抛错（表示烘焙数据与武器段不同步） */
export const getAttackClipById = (clipId: string): BoneAnimationClip => {
    const cached = cache.get(clipId)
    if (cached !== undefined) return cached
    const raw = ATTACK_CLIP_JSON[clipId]
    if (raw === undefined) {
        throw new Error(`攻击动画数据缺失：${clipId}（段 id 必须在 attack_clip_data.ts 中有对应关键帧）`)
    }
    const clip = clipFromJSON(raw)
    cache.set(clipId, clip)
    return clip
}
