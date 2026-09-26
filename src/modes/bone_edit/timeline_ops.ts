import type {BoneAnimationClip} from '../../skeleton/anim/types.ts'

/** 选中关键帧集合：targetId → 时间点集合 */
export type KeyframeSelection = ReadonlyMap<string, ReadonlySet<number>>

/**
 * 时间轴运行期回调槽（可变对象）：
 * 各子模块（tracks/library）在事件回调中经它调用时间轴主装配里的操作，
 * 避免「模块需在函数定义前创建」造成的循环依赖。
 */
export interface TimelineRuntime {
    rebuildPlayer: () => void
    refreshControls: () => void
    renderList: () => void
    renderCanvas: () => void
    addKeyframeAt: (time: number) => void
    syncWeaponForCurrentClip: (force: boolean) => void
}

/** 数值保留三位小数（关键帧时间/时长显示） */
export const round = (v: number): number => Math.round(v * 1000) / 1000

/** 确保 clip 含指定关节轨道（不存在则追加空轨） */
export const upsertJointTrack = (clip: BoneAnimationClip, targetId: string): BoneAnimationClip => {
    if (clip.jointTracks.some(t => t.targetId === targetId)) return clip
    return {
        ...clip,
        jointTracks: [...clip.jointTracks, {
            targetId,
            interpolation: {type: 'bezier_quad', strategy: 'none'},
            records: [],
        }],
    }
}

/** 确保 clip 含指定骨骼段轨道（不存在则追加空轨） */
export const upsertBoneTrack = (clip: BoneAnimationClip, targetId: string): BoneAnimationClip => {
    if (clip.boneTracks.some(t => t.targetId === targetId)) return clip
    return {
        ...clip,
        boneTracks: [...clip.boneTracks, {
            targetId,
            interpolation: {type: 'bezier_quad', strategy: 'none'},
            records: [],
        }],
    }
}
