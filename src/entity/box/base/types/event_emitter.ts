type EventMap = Record<string, any[]>

interface EventEmitter<T extends EventMap> {
    on: <K extends keyof T>(event: K, listener: (...args: T[K]) => void) => () => void
    emit: <K extends keyof T>(event: K, ...args: T[K]) => void
}

const createEmitter = <T extends EventMap>(): EventEmitter<T> => {
    const listeners = new Map<string, Set<(...args: any[]) => void>>()
    return {
        on: (event, listener) => {
            const key = event as string
            if (!listeners.has(key)) listeners.set(key, new Set())
            listeners.get(key)!.add(listener)
            return () => listeners.get(key)?.delete(listener)
        },
        emit: (event, ...args) => {
            const key = event as string
            listeners.get(key)?.forEach(l => l(...args))
        },
    }
}

/** 实体实例级别事件 */
type EntityEventMap = {
    infoUpdate: []
}

/** 数据源级别事件（EntityInfoSource） */
type SourceEventMap = {
    delete: [id: number, wasSelected: boolean]
    select: [id: number | undefined]
}

type EntityEmitter = EventEmitter<EntityEventMap>
type SourceEmitter = EventEmitter<SourceEventMap>

export type {EventMap, EventEmitter, EntityEventMap, EntityEmitter, SourceEventMap, SourceEmitter}
export {createEmitter}
