import {describe, it, expect} from 'vitest'
import type {SpawnMode} from '../../types/spawnMode.ts'
import {alignSpawnPosition, alignSpawnValue, spawnAlignmentStep} from './spawn_alignment.ts'

const ALL_MODES: SpawnMode[] = [
    'box',
    'area',
    'character',
    'terrain',
    'building_generator',
    'interactable',
]

describe('生成坐标对齐', () => {
    it('角色 / 交互物使用 1/2 格，其余使用整数格', () => {
        for (const mode of ALL_MODES) {
            const expected = mode === 'character' || mode === 'interactable' ? 0.5 : 1
            expect(spawnAlignmentStep(mode)).toBe(expected)
        }
    })

    it('整数格点取最近整数', () => {
        expect(alignSpawnValue(1.49, 1)).toBe(1)
        expect(alignSpawnValue(1.51, 1)).toBe(2)
        expect(alignSpawnValue(-1.49, 1)).toBe(-1)
        expect(alignSpawnValue(-1.51, 1)).toBe(-2)
    })

    it('半格取最近 0.5 的倍数且无浮点尾差', () => {
        expect(alignSpawnValue(1.24, 0.5)).toBe(1)
        expect(alignSpawnValue(1.26, 0.5)).toBe(1.5)
        expect(alignSpawnValue(-1.26, 0.5)).toBe(-1.5)
        expect(alignSpawnValue(0.3, 0.5)).toBe(0.5)
        expect(alignSpawnValue(3.7000000000000006, 0.5)).toBe(3.5)
    })

    it('-0 归一化为 0', () => {
        expect(Object.is(alignSpawnValue(-0.1, 1), -0)).toBe(false)
        expect(alignSpawnValue(-0.1, 1)).toBe(0)
        expect(alignSpawnValue(-0.1, 0.5)).toBe(0)
    })

    it('三轴使用同一模式步长', () => {
        expect(alignSpawnPosition('character', 1.2, 2.7, -3.3)).toEqual([1, 2.5, -3.5])
        expect(alignSpawnPosition('box', 1.2, 2.7, -3.3)).toEqual([1, 3, -3])
    })
})
