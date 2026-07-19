type Listener = (...args: any[]) => void

interface EventEmitter {
    on: (event: string, listener: Listener) => () => void
    emit: (event: string, ...args: any[]) => void
}

const createEmitter = (): EventEmitter => {
    const listeners = new Map<string, Set<Listener>>()
    return {
        on: (event, listener) => {
            if (!listeners.has(event)) listeners.set(event, new Set())
            listeners.get(event)!.add(listener)
            return () => listeners.get(event)?.delete(listener)
        },
        emit: (event, ...args) => {
            listeners.get(event)?.forEach(l => l(...args))
        },
    }
}

export {type EventEmitter, createEmitter}
