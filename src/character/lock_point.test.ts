import {describe, it, expect} from 'vitest'
import {sanitizeLockPoints, type LockPointConfig} from './lock_point.ts'

describe('sanitizeLockPoints', () => {
    it('缺失配置回退空数组', () => {
        expect(sanitizeLockPoints(undefined)).toEqual([])
    })

    it('保留合法条目并拷贝为独立对象', () => {
        const source: LockPointConfig[] = [{jointId: 'headNeck', offset: [0, 0.2, 0]}]
        const result = sanitizeLockPoints(source)
        expect(result).toEqual([{jointId: 'headNeck', offset: [0, 0.2, 0]}])
        expect(result[0]).not.toBe(source[0])
    })

    it('剔除空关节 id 与非有限偏移，不抛错', () => {
        const result = sanitizeLockPoints([
            {jointId: '', offset: [0, 0, 0]},
            {jointId: 'spine', offset: [Number.NaN, 0, 0]},
            {jointId: 'spine', offset: [0, Number.POSITIVE_INFINITY, 0]},
            {jointId: 'spine', offset: [1, 2, 3]},
        ])
        expect(result).toEqual([{jointId: 'spine', offset: [1, 2, 3]}])
    })
})
