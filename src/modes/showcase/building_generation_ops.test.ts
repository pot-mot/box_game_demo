import {describe, it, expect} from 'vitest'
import {captureBuildingOps} from './building_generation_ops.ts'

const CONFIG = {recipe: 'house', seed: 7, sizeX: 8, sizeY: 5, sizeZ: 8}

describe('建筑生成操作捕获', () => {
    it('返回非空的 set / clear 序列且同配置确定', () => {
        const a = captureBuildingOps(CONFIG)
        const b = captureBuildingOps(CONFIG)
        expect(a.length).toBeGreaterThan(0)
        expect(a).toEqual(b)
        expect(a.some(op => op.material !== undefined)).toBe(true)
        expect(a.some(op => op.material === undefined)).toBe(true)
    })

    it('不同种子生成不同操作序列', () => {
        const a = captureBuildingOps(CONFIG)
        const b = captureBuildingOps({...CONFIG, seed: 8})
        expect(a).not.toEqual(b)
    })
})
