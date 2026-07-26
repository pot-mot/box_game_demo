import type {SaveData} from './types.ts'

const CACHE_KEY = 'box_demo_save'

export const cacheSaveData = (data: SaveData): void => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } catch {
        // localStorage 满或不可用时静默失败
    }
}

export const loadCachedSaveData = (): SaveData | undefined => {
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return undefined
        return JSON.parse(raw) as unknown as SaveData
    } catch {
        return undefined
    }
}

export const clearCachedSaveData = (): void => {
    try {
        localStorage.removeItem(CACHE_KEY)
    } catch {
        // 静默忽略
    }
}
