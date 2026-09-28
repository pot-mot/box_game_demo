import {describe, it, expect} from 'vitest'
import {shapeInfo, buildOccupancy, canPlace, findPlacement} from './grid.ts'
import {createInventory} from './inventory.ts'
import type {InventoryState} from './types.ts'

describe('物品形状旋转', () => {
    it('1×4 竖条旋转 90° 变 4×1 横条', () => {
        const info = shapeInfo(['#', '#', '#', '#'], 1)
        expect(info.w).toBe(4)
        expect(info.h).toBe(1)
    })

    it('L 形旋转保持占格数量不变', () => {
        const shape = ['##', '.#']
        const count = (m: readonly (readonly boolean[])[]): number => m.flat().filter(Boolean).length
        const base = shapeInfo(shape, 0)
        for (let rot = 0; rot < 4; rot++) {
            expect(count(shapeInfo(shape, rot as 0 | 1 | 2 | 3).mask)).toBe(count(base.mask))
        }
    })
})

describe('背包占位与放置', () => {
    const inv = (): InventoryState => createInventory(4, 4)

    it('空背包可放置，越界或重叠不可放置', () => {
        const i = inv()
        const occ = buildOccupancy(i)
        const info = shapeInfo(['#', '#'], 0)
        expect(canPlace(occ, i.width, i.height, info, 0, 0)).toBe(true)
        expect(canPlace(occ, i.width, i.height, info, 3, 3)).toBe(false)
        i.stacks.push({instanceId: 'a', defId: 'material_stone', count: 1, grid: {x: 0, y: 0, rot: 0}})
        expect(canPlace(buildOccupancy(i), i.width, i.height, info, 0, 0)).toBe(false)
    })

    it('findPlacement 在空间不足时返回 undefined', () => {
        const i = inv()
        for (let y = 0; y < i.height; y++) {
            for (let x = 0; x < i.width; x++) {
                i.stacks.push({instanceId: `s${x}_${y}`, defId: 'material_stone', count: 1, grid: {x, y, rot: 0}})
            }
        }
        expect(findPlacement(buildOccupancy(i), i.width, i.height, ['#'])).toBeUndefined()
    })
})
