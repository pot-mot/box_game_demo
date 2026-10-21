import type {BoneAnimationClip} from '../../skeleton/anim/types.ts'
import {createAnimationStore, type AnimationStore} from './animation_store.ts'

/** 每体形独立动画库：对外暴露一个委托当前体形 store 的路由，时间轴无需感知切换 */
export interface FormAnimationStores {
    readonly formIds: readonly string[]
    readonly activeFormId: string
    readonly store: AnimationStore
    readonly setActive: (formId: string) => void
    readonly storeOf: (formId: string) => AnimationStore
}

export const createFormAnimationStores = (
    formIds: readonly string[],
    defaultFormId: string,
): FormAnimationStores => {
    const stores = new Map<string, AnimationStore>(formIds.map(formId => [formId, createAnimationStore()]))
    let activeFormId = stores.has(defaultFormId) ? defaultFormId : (formIds[0] ?? defaultFormId)

    const activeStore = (): AnimationStore => {
        const store = stores.get(activeFormId)
        if (store === undefined) throw new Error(`未知骨骼体形：${activeFormId}`)
        return store
    }

    const router: AnimationStore = {
        get clips() { return activeStore().clips },
        get current() { return activeStore().current },
        get currentName() { return activeStore().currentName },
        createEmpty: (name: string) => activeStore().createEmpty(name),
        add: (clip: BoneAnimationClip) => activeStore().add(clip),
        importClip: (clip: BoneAnimationClip) => activeStore().importClip(clip),
        remove: (name: string) => activeStore().remove(name),
        rename: (from: string, to: string) => activeStore().rename(from, to),
        select: (name: string | undefined) => activeStore().select(name),
        updateMeta: (meta) => activeStore().updateMeta(meta),
        replaceAll: (clips, currentName) => activeStore().replaceAll(clips, currentName),
        updateCurrent: (update) => activeStore().updateCurrent(update),
    }

    return {
        formIds,
        get activeFormId() { return activeFormId },
        store: router,
        setActive: (formId) => {
            if (stores.has(formId)) activeFormId = formId
        },
        storeOf: (formId) => {
            const store = stores.get(formId)
            if (store === undefined) throw new Error(`未知骨骼体形：${formId}`)
            return store
        },
    }
}
