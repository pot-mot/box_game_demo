import type {BoneAnimationClip, BoneJointTrack, BoneSegmentTrack} from './types.ts'

/**
 * 目标 id 映射：键 = 源 clip 的轨道目标 id，值 = 目标骨架的关节/骨骼段 id。
 * 用于把生产角色 clip 复用到骨骼编辑器骨架（两套骨架的关节命名存在差异）。
 */
export type TargetIdMapping = ReadonlyMap<string, string>

/**
 * 重定向 clip 的轨道目标 id（关节轨与骨骼段轨）：
 * 记录、插值规格与事件轨原样保留（不复制记录对象，需要独立副本时另行 cloneClip）；
 * 映射中不存在的 id 原样保留 —— 目标骨架缺少该关节时该轨道不生效，不影响其余轨道。
 */
export const remapClipTargets = (clip: BoneAnimationClip, mapping: TargetIdMapping): BoneAnimationClip => {
    if (mapping.size === 0) return clip

    const remapJoint = (track: BoneJointTrack): BoneJointTrack => {
        const targetId = mapping.get(track.targetId)
        return targetId === undefined ? track : {...track, targetId}
    }
    const remapBone = (track: BoneSegmentTrack): BoneSegmentTrack => {
        const targetId = mapping.get(track.targetId)
        return targetId === undefined ? track : {...track, targetId}
    }

    return {
        ...clip,
        jointTracks: clip.jointTracks.map(remapJoint),
        boneTracks: clip.boneTracks.map(remapBone),
    }
}

/** 由别名表（Record）构造目标 id 映射 */
export const createTargetIdMapping = (aliases: Readonly<Record<string, string>>): TargetIdMapping =>
    new Map(Object.entries(aliases))
