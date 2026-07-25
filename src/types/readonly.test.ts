import {describe, it} from 'vitest'
import type {DeepReadonly} from './readonly.ts'

describe('DeepReadonly', () => {
    it('makes simple object properties readonly', () => {
        type Original = {a: number; b: string}
        type Readonlyified = DeepReadonly<Original>
        const obj: Readonlyified = {a: 1, b: 'hello'}
        // @ts-expect-error — 写入只读属性应报错
        obj.a = 2
    })

    it('deeply makes nested object properties readonly', () => {
        type Original = {nested: {value: number}}
        type Readonlyified = DeepReadonly<Original>
        const obj: Readonlyified = {nested: {value: 42}}
        // @ts-expect-error — 深层只读
        obj.nested.value = 0
    })

    it('makes array elements readonly', () => {
        type Original = {items: number[]}
        type Readonlyified = DeepReadonly<Original>
        const obj: Readonlyified = {items: [1, 2, 3]}
        // @ts-expect-error — 数组元素只读
        obj.items[0] = 99
    })

    it('preserves function types without making them readonly', () => {
        type Original = {fn: (x: number) => string}
        type Readonlyified = DeepReadonly<Original>
        const obj: Readonlyified = {fn: (x: number) => String(x)}
        // 函数类型不应被 readonly 包裹，应可调用
        obj.fn(42)
    })

    it('handles Map types', () => {
        type Original = {map: Map<string, number>}
        type Readonlyified = DeepReadonly<Original>
        const obj: Readonlyified = {map: new Map([['a', 1]])}
        // @ts-expect-error — 只读 Map 无 set 方法
        obj.map.set('b', 2)
    })

    it('handles Set types', () => {
        type Original = {set: Set<number>}
        type Readonlyified = DeepReadonly<Original>
        const obj: Readonlyified = {set: new Set([1, 2])}
        // @ts-expect-error — 只读 Set 无 add 方法
        obj.set.add(3)
    })

    it('leaves primitive types unchanged', () => {
        type Result = DeepReadonly<number>
        const x: Result = 42
        x satisfies number
    })
})
