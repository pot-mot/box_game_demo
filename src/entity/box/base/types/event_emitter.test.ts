import {describe, it, expect} from 'vitest'
import {createEmitter, type EntityEmitter, type SourceEmitter} from './event_emitter.ts'

describe('createEmitter', () => {
    it('emits event to subscribed listener', () => {
        const emitter = createEmitter<{test: [string]}>()
        const results: string[] = []
        emitter.on('test', (msg: string) => results.push(msg))
        emitter.emit('test', 'hello')
        expect(results).toEqual(['hello'])
    })

    it('passes multiple arguments to listener', () => {
        const emitter = createEmitter<{test: [number, string, boolean]}>()
        const results: unknown[] = []
        emitter.on('test', (a, b, c) => results.push(a, b, c))
        emitter.emit('test', 42, 'abc', true)
        expect(results).toEqual([42, 'abc', true])
    })

    it('unsubscribes listener via returned function', () => {
        const emitter = createEmitter<{test: []}>()
        let count = 0
        const off = emitter.on('test', () => count++)
        emitter.emit('test')
        expect(count).toBe(1)
        off()
        emitter.emit('test')
        expect(count).toBe(1)
    })

    it('supports multiple listeners for same event', () => {
        const emitter = createEmitter<{test: []}>()
        let a = 0
        let b = 0
        emitter.on('test', () => a++)
        emitter.on('test', () => b++)
        emitter.emit('test')
        expect(a).toBe(1)
        expect(b).toBe(1)
    })

    it('does not throw when emitting unsubscribed event', () => {
        const emitter = createEmitter<{test: []}>()
        emitter.on('test', () => {})
        emitter.emit('test')
        expect(true).toBe(true)
    })

    it('does not affect other events when unsubscribing', () => {
        const emitter = createEmitter<{a: []; b: []}>()
        let aCount = 0
        let bCount = 0
        const offA = emitter.on('a', () => aCount++)
        emitter.on('b', () => bCount++)
        emitter.emit('a')
        emitter.emit('b')
        expect(aCount).toBe(1)
        expect(bCount).toBe(1)
        offA()
        emitter.emit('a')
        emitter.emit('b')
        expect(aCount).toBe(1)
        expect(bCount).toBe(2)
    })
})

describe('EntityEmitter', () => {
    it('emits infoUpdate without arguments', () => {
        const emitter: EntityEmitter = createEmitter()
        let called = false
        emitter.on('infoUpdate', () => called = true)
        emitter.emit('infoUpdate')
        expect(called).toBe(true)
    })
})

describe('SourceEmitter', () => {
    it('emits delete with id and wasSelected', () => {
        const emitter: SourceEmitter = createEmitter()
        let data: [number, boolean] | undefined
        emitter.on('delete', (id, wasSelected) => data = [id, wasSelected])
        emitter.emit('delete', 1, true)
        expect(data).toEqual([1, true])
    })

    it('emits select with id or undefined', () => {
        const emitter: SourceEmitter = createEmitter()
        const results: (number | undefined)[] = []
        emitter.on('select', id => results.push(id))
        emitter.emit('select', 42)
        emitter.emit('select', undefined)
        expect(results).toEqual([42, undefined])
    })
})
