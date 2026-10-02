/**
 * 通用对象池 —— 供弹丸记录 / 视觉实例 / 特效槽位复用，避免热路径反复分配。
 *
 * 语义：
 * - `acquire` 优先从空闲栈取出，栈空则调用工厂新建；
 * - `release` 先执行 `onRelease`（如禁用刚体、移出场景），再压入空闲栈；
 * - 超过 `max` 上限时直接 `onDispose` 销毁，避免池无限膨胀；
 * - `dispose` 释放空闲栈中的全部实例（在飞对象由调用方先行归还）。
 */
export interface ObjectPool<T> {
    readonly acquire: () => T
    readonly release: (item: T) => void
    /** 当前空闲实例数 */
    readonly size: () => number
    readonly dispose: () => void
}

export const createObjectPool = <T>(
    factory: () => T,
    onRelease: (item: T) => void,
    onDispose: (item: T) => void,
    max = Number.POSITIVE_INFINITY,
): ObjectPool<T> => {
    const free: T[] = []

    const acquire = (): T => {
        const item = free.pop()
        return item !== undefined ? item : factory()
    }

    const release = (item: T): void => {
        if (free.length >= max) {
            onDispose(item)
            return
        }
        onRelease(item)
        free.push(item)
    }

    const dispose = (): void => {
        for (const item of free) onDispose(item)
        free.length = 0
    }

    return {acquire, release, size: () => free.length, dispose}
}
