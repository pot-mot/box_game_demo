import {describe, it, expect} from 'vitest'
import {stairs, spiralStairs, pitchedRoof, corridor, dougong, pillar, rotateQuarter, floorSlab} from './architecture.ts'
import type {BlockWriter} from './structures.ts'
import type {SurfaceMaterialId} from '../../../render/materials/index.ts'

const recorder = (): {writer: BlockWriter; blocks: Map<string, SurfaceMaterialId>} => {
    const blocks = new Map<string, SurfaceMaterialId>()
    const key = (x: number, y: number, z: number): string => `${x},${y},${z}`
    return {
        blocks,
        writer: {
            set: (x, y, z, material) => { blocks.set(key(x, y, z), material) },
            clear: (x, y, z) => { blocks.delete(key(x, y, z)) },
        },
    }
}

describe('建筑结构原语', () => {
    it('rotateQuarter 覆盖四个方向', () => {
        expect(rotateQuarter(1, 0, 0)).toEqual([1, 0])
        expect(rotateQuarter(1, 0, 1)).toEqual([0, 1])
        expect(rotateQuarter(1, 0, 2)).toEqual([-1, 0])
        expect(rotateQuarter(1, 0, 3)).toEqual([0, -1])
    })

    it('直跑楼梯每级高度递增 1、可连续攀爬', () => {
        const {writer, blocks} = recorder()
        stairs(writer, 0, 0, 0, 0, 6, 3, 'brick')
        for (let i = 0; i < 6; i++) {
            expect(blocks.has(`${i},${i},0`)).toBe(true)
        }
    })

    it('旋转楼梯连续生成且高度覆盖行程', () => {
        const {writer, blocks} = recorder()
        spiralStairs(writer, 0, 0, 0, 3, 8, 'rock')
        expect(blocks.size).toBeGreaterThan(0)
        const ys = new Set([...blocks.keys()].map(k => Number(k.split(',')[1])))
        expect(ys.has(0)).toBe(true)
        expect(ys.has(7)).toBe(true)
    })

    it('斜屋顶首层檐口比墙体宽（外扩）', () => {
        const {writer, blocks} = recorder()
        pitchedRoof(writer, 0, 5, 0, 4, 4, 3, 'tile', 'x')
        /* y=5 层 x 范围应超出 [0,3]（外扩檐口） */
        const xsAtBase = [...blocks.keys()].filter(k => k.split(',')[1] === '5').map(k => Number(k.split(',')[0]))
        expect(Math.min(...xsAtBase)).toBeLessThan(0)
        expect(Math.max(...xsAtBase)).toBeGreaterThan(3)
    })

    it('廊桥两端连通且生成支柱', () => {
        const {writer, blocks} = recorder()
        corridor(writer, 0, 0, 5, 0, 3, 1, 'wood')
        expect(blocks.has('0,3,0')).toBe(true)
        expect(blocks.has('5,3,0')).toBe(true)
        /* 支柱：从 y=0 到桥面 */
        expect(blocks.has('0,0,0')).toBe(true)
    })

    it('斗拱与支柱生成实心结构', () => {
        const {writer, blocks} = recorder()
        pillar(writer, 0, 0, 0, 4, 'wood')
        expect(blocks.has('0,3,0')).toBe(true)
        dougong(writer, 0, 4, 0, 'wood')
        expect(blocks.has('1,6,1')).toBe(true)
    })

    it('地台填满矩形', () => {
        const {writer, blocks} = recorder()
        floorSlab(writer, 0, 0, 0, 3, 3, 'rock')
        expect(blocks.size).toBe(9)
    })
})
