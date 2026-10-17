import {describe, it, expect, beforeAll, afterAll, vi} from 'vitest'
import {createFragmentMesh} from './index.ts'
import {TILE_SIZE} from '../../../../render/constants.ts'
import type {FragmentData} from '../../../destroyed/types'

/**
 * happy-dom 不支持 canvas 2d，注入 2d 上下文桩（表面材质纹理需要）。
 * Proxy 吞掉全部绘制调用：纹理内容在单测中无意义，只要求不抛错。
 */
const canvasCtxStub = (): unknown => new Proxy({}, {
    get: () => () => undefined,
})

const originalGetContext = HTMLCanvasElement.prototype.getContext
let warnSpy: ReturnType<typeof vi.spyOn>

beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => canvasCtxStub(),
        configurable: true,
        writable: true,
    })
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: originalGetContext,
        configurable: true,
        writable: true,
    })
    warnSpy.mockRestore()
})

const dataOf = (
    renderVertices: number[],
    renderIndices: number[],
): FragmentData => ({
    renderVertices: new Float32Array(renderVertices),
    renderIndices,
    hullVertices: [],
    hullFaces: [],
    centroid: [0, 0, 0],
    massRatio: 1,
    boxSize: [1, 1, 1],
})

describe('碎片 UV 生成（逐三角面）', () => {
    it('与原箱子共面的三角面：UV 与 scaleBoxUVs 逐面对齐（1×1×1 箱 +X 面）', () => {
        /* +X 面（x=+0.5）上的 1×1 方块，外法线 +X */
        const data = dataOf([
            0.5, -0.5, -0.5,
            0.5, 0.5, -0.5,
            0.5, 0.5, 0.5,
            0.5, -0.5, 0.5,
        ], [0, 1, 2, 0, 2, 3])
        const mesh = createFragmentMesh(data, 'rock')
        const uv = mesh.geometry.getAttribute('uv')

        /* 期望：u=(hd - z)/T，v=(hh + y)/T，hd=hh=0.5，1/T = 2 */
        const inv = 1 / TILE_SIZE
        expect(uv.getX(0)).toBeCloseTo(1 * inv, 5); expect(uv.getY(0)).toBeCloseTo(0, 5)
        expect(uv.getX(1)).toBeCloseTo(1 * inv, 5); expect(uv.getY(1)).toBeCloseTo(1 * inv, 5)
        expect(uv.getX(2)).toBeCloseTo(0, 5); expect(uv.getY(2)).toBeCloseTo(1 * inv, 5)
        expect(uv.getX(4)).toBeCloseTo(0, 5); expect(uv.getY(4)).toBeCloseTo(1 * inv, 5)
        expect(uv.getX(5)).toBeCloseTo(0, 5); expect(uv.getY(5)).toBeCloseTo(0, 5)
    })

    it('倾斜裂面：等距投影，两条正交单位边的 UV 长度相等且正交（无拉伸）', () => {
        const s = Math.SQRT1_2
        /* 法线 n=(s,s,0) 的斜面上，两条正交单位边 e1=(0,0,1)、e2=(s,-s,0) */
        const data = dataOf([
            0, 0, 0,
            0, 0, 1,
            s, -s, 0,
        ], [0, 1, 2])
        const mesh = createFragmentMesh(data, 'rock')
        const uv = mesh.geometry.getAttribute('uv')

        const du1 = {x: uv.getX(1) - uv.getX(0), y: uv.getY(1) - uv.getY(0)}
        const du2 = {x: uv.getX(2) - uv.getX(0), y: uv.getY(2) - uv.getY(0)}
        const len = (d: {x: number; y: number}): number => Math.sqrt(d.x * d.x + d.y * d.y)

        expect(len(du1)).toBeCloseTo(1 / TILE_SIZE, 5)
        expect(len(du2)).toBeCloseTo(1 / TILE_SIZE, 5)
        expect(du1.x * du2.x + du1.y * du2.y).toBeCloseTo(0, 5)
    })
})
