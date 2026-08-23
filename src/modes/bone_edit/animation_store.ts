import type {BoneAnimationClip} from '../../skeleton/anim/types.ts'

/** 动画库存储：多动画管理 + 当前选中（由 index 装配，timeline/history 共享） */
export interface AnimationStore {
    readonly clips: ReadonlyMap<string, BoneAnimationClip>
    readonly current: BoneAnimationClip | undefined
    readonly currentName: string | undefined
    /** 新建空动画并选中（name 重复时自动加后缀） */
    createEmpty: (name: string) => BoneAnimationClip
    /** 添加/覆盖动画（不切换选中） */
    add: (clip: BoneAnimationClip) => void
    remove: (name: string) => void
    rename: (from: string, to: string) => void
    select: (name: string | undefined) => void
    /** 更新当前动画的时长/循环 */
    updateMeta: (meta: {duration?: number; loop?: boolean}) => void
    /** 整体替换（undo 恢复/导入用），按 name 保持选中 */
    replaceAll: (clips: readonly BoneAnimationClip[], currentName?: string) => void
    /** 当前动画不可变更新（编辑器轨道操作）；返回新 clip */
    updateCurrent: (update: (clip: BoneAnimationClip) => BoneAnimationClip) => BoneAnimationClip | undefined
}

const uniqueName = (clips: ReadonlyMap<string, BoneAnimationClip>, base: string): string => {
    if (!clips.has(base)) return base
    let i = 2
    while (clips.has(`${base}_${i}`)) i += 1
    return `${base}_${i}`
}

export const createAnimationStore = (): AnimationStore => {
    const clips = new Map<string, BoneAnimationClip>()
    let currentName: string | undefined

    const createEmpty = (name: string): BoneAnimationClip => {
        const finalName = uniqueName(clips, name)
        const clip: BoneAnimationClip = {
            name: finalName,
            duration: 1,
            loop: false,
            jointTracks: [],
            boneTracks: [],
            eventTracks: [],
        }
        clips.set(finalName, clip)
        currentName = finalName
        return clip
    }

    const select = (name: string | undefined): void => {
        if (name !== undefined && !clips.has(name)) return
        currentName = name
    }

    const updateCurrent = (update: (clip: BoneAnimationClip) => BoneAnimationClip): BoneAnimationClip | undefined => {
        if (currentName === undefined) return undefined
        const current = clips.get(currentName)
        if (current === undefined) return undefined
        const next = update(current)
        clips.set(currentName, next)
        return next
    }

    return {
        get clips() { return clips },
        get current() { return currentName !== undefined ? clips.get(currentName) : undefined },
        get currentName() { return currentName },
        createEmpty,
        add: (clip) => { clips.set(clip.name, clip) },
        remove: (name) => {
            if (clips.delete(name) && currentName === name) {
                currentName = clips.keys().next().value as string | undefined
            }
        },
        rename: (from, to) => {
            const clip = clips.get(from)
            if (clip === undefined) return
            const finalName = uniqueName(clips, to)
            clips.delete(from)
            clips.set(finalName, {...clip, name: finalName})
            if (currentName === from) currentName = finalName
        },
        select,
        updateMeta: ({duration, loop}) => {
            if (currentName === undefined) return
            const current = clips.get(currentName)
            if (current === undefined) return
            clips.set(currentName, {
                ...current,
                duration: duration !== undefined ? Math.max(duration, 0.01) : current.duration,
                loop: loop ?? current.loop,
            })
        },
        replaceAll: (nextClips, nextCurrentName) => {
            clips.clear()
            for (const clip of nextClips) clips.set(clip.name, clip)
            currentName = nextCurrentName !== undefined && clips.has(nextCurrentName) ? nextCurrentName : undefined
        },
        updateCurrent,
    }
}