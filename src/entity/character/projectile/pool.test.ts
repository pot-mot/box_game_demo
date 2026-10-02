import {describe, it, expect} from 'vitest'
import {createObjectPool} from './pool.ts'

describe('createObjectPool', () => {
    it('acquire 优先复用空闲实例，release 触发回收回调', () => {
        const released: number[] = []
        const pool = createObjectPool<{id: number}>(
            () => ({id: Math.random()}),
            (item) => released.push(item.id),
            () => {},
            8,
        )
        const a = pool.acquire()
        expect(pool.size()).toBe(0)
        pool.release(a)
        expect(pool.size()).toBe(1)
        expect(released).toEqual([a.id])

        const b = pool.acquire()
        expect(b).toBe(a)
        expect(pool.size()).toBe(0)
    })

    it('空闲栈达到上限后 release 直接销毁（不膨胀）', () => {
        const disposed: number[] = []
        let seq = 0
        const pool = createObjectPool<{id: number}>(
            () => ({id: seq++}),
            () => {},
            (item) => disposed.push(item.id),
            2,
        )
        const items = [pool.acquire(), pool.acquire(), pool.acquire()]
        for (const item of items) pool.release(item)
        expect(pool.size()).toBe(2)
        expect(disposed).toEqual([items[2].id])
    })

    it('dispose 释放空闲栈中的全部实例', () => {
        const disposed: number[] = []
        let seq = 0
        const pool = createObjectPool<{id: number}>(
            () => ({id: seq++}),
            () => {},
            (item) => disposed.push(item.id),
            8,
        )
        const a = pool.acquire()
        const b = pool.acquire()
        pool.release(a)
        pool.release(b)
        expect(pool.size()).toBe(2)
        pool.dispose()
        expect(disposed).toHaveLength(2)
        expect(pool.size()).toBe(0)
    })
})
