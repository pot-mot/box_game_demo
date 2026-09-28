import {describe, it, expect} from 'vitest'
import {pickInteraction} from './resolve.ts'
import type {InteractionTarget} from '../../../character/interaction/types.ts'

const target = (key: string, x: number, z: number): InteractionTarget => ({
    key, kind: 'test', prompt: key, x, y: 0, z, score: 0,
})

describe('交互目标择优', () => {
    it('从前方候选中取最近者', () => {
        const picked = pickInteraction(
            [target('far', 0, 2), target('near', 0, 1)],
            0, 0, 0,
            0, 1,
        )
        expect(picked?.key).toBe('near')
    })

    it('镜头背后的目标被角度过滤', () => {
        const picked = pickInteraction([target('behind', 0, -1)], 0, 0, 0, 0, 1)
        expect(picked).toBeUndefined()
    })

    it('超出最大距离的目标被过滤', () => {
        const picked = pickInteraction([target('far', 0, 100)], 0, 0, 0, 0, 1)
        expect(picked).toBeUndefined()
    })

    it('无候选返回 undefined', () => {
        expect(pickInteraction([], 0, 0, 0, 0, 1)).toBeUndefined()
    })
})
