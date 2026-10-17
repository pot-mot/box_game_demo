import type {ParsedSaveData} from './validation.ts'
import {parseSaveData} from './validation.ts'

const CACHE_KEY = 'box_demo_save'

export const cacheSaveData = (data: unknown): void => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } catch {
        // localStorage 满或不可用时静默失败
    }
}

/** 读取本地缓存存档并校验；返回值含被跳过元素的明细（无缓存时 undefined） */
export const loadCachedSaveData = (): ParsedSaveData | undefined => {
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return undefined
        const parsed = JSON.parse(raw)
        return parseSaveData(parsed)
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
