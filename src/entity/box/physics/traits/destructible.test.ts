import {describe, it, expect} from 'vitest'
import {buildFragments} from './destructible.ts'
import type {CollisionRecord} from '../../types'

const record = (
    contactPoint: [number, number, number],
    normal: [number, number, number],
    relativeVelocity: number,
): CollisionRecord => ({contactPoint, normal, relativeVelocity})

const BODY_POS = {x: 0, y: 0, z: 0}
const BODY_ROT = {x: 0, y: 0, z: 0, w: 1}
const SIZE = [1, 1, 1] as const

/** 碎片集合签名（质心排序后拼接），用于比较两次碎裂是否不同 */
const signature = (fragments: ReturnType<typeof buildFragments>): string =>
    fragments
        .map(f => f.centroid.map(v => v.toFixed(3)).join(','))
        .sort()
        .join('|')

describe('箱子碎裂（受力方向驱动 + 块数可调）', () => {
    it('目标块数越多，实际碎片越多', () => {
        const history = [record([0.5, 0, 0], [1, 0, 0], 10)]
        const few = buildFragments(SIZE, history, BODY_POS, BODY_ROT, 3)
        const many = buildFragments(SIZE, history, BODY_POS, BODY_ROT, 16)
        expect(few.length).toBeGreaterThanOrEqual(2)
        expect(many.length).toBeGreaterThan(few.length)
    })

    it('不同受力方向产生不同碎裂方式', () => {
        const contact: [number, number, number] = [0.5, 0, 0]
        const alongX = buildFragments(SIZE, [record(contact, [1, 0, 0], 10)], BODY_POS, BODY_ROT, 6)
        const alongY = buildFragments(SIZE, [record(contact, [0, 1, 0], 10)], BODY_POS, BODY_ROT, 6)
        expect(signature(alongX)).not.toBe(signature(alongY))
    })

    it('无碰撞历史时仍可生成至少最小块数', () => {
        const fragments = buildFragments(SIZE, [], BODY_POS, BODY_ROT, 6)
        expect(fragments.length).toBeGreaterThanOrEqual(2)
    })
})
