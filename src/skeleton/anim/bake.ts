import type {Quaternion, Vector3} from 'three'
import type {BoneAnimationClip, BoneJointKeyframeRecord} from './types.ts'

/** 通用 clip 烘焙采样率（fps） */
export const DEFAULT_BAKE_FPS = 30

/** 单关节采样结果（局部 pose） */
export interface BakedJointPose {
    readonly position: Vector3
    readonly rotation: Quaternion
}

/**
 * 通用 clip 烘焙（纯引擎工具，跨体形适用）：把逐帧姿态函数按固定采样率烘焙为稀疏关键帧 clip。
 * `sample(t)` 返回 t 时刻各关节的局部 pose（缺失的关节该帧跳过）；插值统一 bezier_quad/none（线性）。
 * 人形基础状态走 `entity/character` 的既有烘焙；狼 / 马 / wyvern 等体形用本工具。
 */
export const bakeClip = (
    name: string,
    duration: number,
    loop: boolean,
    jointIds: readonly string[],
    sample: (t: number) => ReadonlyMap<string, BakedJointPose>,
    fps = DEFAULT_BAKE_FPS,
): BoneAnimationClip => {
    const frames = Math.max(2, Math.round(duration * fps) + 1)
    const records: BoneJointKeyframeRecord[][] = jointIds.map(() => [])
    for (let i = 0; i < frames; i++) {
        const t = duration * i / (frames - 1)
        const pose = sample(t)
        for (let j = 0; j < jointIds.length; j++) {
            const p = pose.get(jointIds[j])
            if (p === undefined) continue
            records[j].push({time: t, position: p.position, rotation: p.rotation})
        }
    }
    const jointTracks = jointIds
        .map((targetId, j) => ({
            targetId,
            interpolation: {type: 'bezier_quad', strategy: 'none'} as const,
            records: records[j],
        }))
        /* 未声明姿态的关节不产轨道（保留骨架当前姿态） */
        .filter(track => track.records.length > 0)
    return {name, duration, loop, jointTracks, boneTracks: [], eventTracks: []}
}
