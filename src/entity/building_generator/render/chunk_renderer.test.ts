import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {Group, Vector3} from 'three'
import {SURFACE_MATERIAL_INDEX} from '../../../render/materials/ids.ts'
import {setBlock, type ChunkStore} from '../grid/block_world.ts'
import {createWorldMeshRenderer} from './chunk_renderer.ts'

/** happy-dom 不支持 canvas 2d，注入最小 2d 上下文桩（材质图集需要） */
const canvasCtxStub = (): Record<string, unknown> => ({
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    save: () => {},
    restore: () => {},
    translate: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    stroke: () => {},
    fill: () => {},
    fillRect: () => {},
})

const originalGetContext = HTMLCanvasElement.prototype.getContext

beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => canvasCtxStub(),
        configurable: true,
        writable: true,
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: originalGetContext,
        configurable: true,
        writable: true,
    })
})

const createFloorChunk = (): ChunkStore => {
    const chunks: ChunkStore = new Map()
    for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) setBlock(chunks, x, 0, z, SURFACE_MATERIAL_INDEX.rock)
    }
    return chunks
}

describe('chunk_renderer 两级绘制与距离卸载', () => {
    it('近处 detail、中距离 lod、远处卸载', () => {
        const chunks = createFloorChunk()
        const dirty = new Set<string>(chunks.keys())
        const group = new Group()
        const renderer = createWorldMeshRenderer(group, chunks, dirty)

        /* 近处：全细节网格，可拾取 */
        renderer.update(new Vector3(8, 1, 8))
        expect(renderer.getPickMeshes().length).toBe(1)
        expect(group.children.length).toBe(1)

        /* 中距离（96 < d < 224）：粗 LOD，无细节拾取网格 */
        const mid = new Vector3(0, 1, 150)
        for (let i = 0; i < 5; i++) renderer.update(mid)
        expect(renderer.getPickMeshes().length).toBe(0)
        expect(group.children.length).toBe(1)

        /* 远处（> 256）：卸载 */
        renderer.update(new Vector3(0, 1, 400))
        expect(group.children.length).toBe(0)

        renderer.dispose()
    })

    it('数据变更后重建网格', () => {
        const chunks = createFloorChunk()
        const dirty = new Set<string>(chunks.keys())
        const group = new Group()
        const renderer = createWorldMeshRenderer(group, chunks, dirty)

        renderer.update(new Vector3(8, 1, 8))
        expect(group.children.length).toBe(1)
        const firstMesh = group.children[0]

        dirty.add('0,0,0')
        renderer.update(new Vector3(8, 1, 8))
        expect(group.children.length).toBe(1)
        expect(group.children[0]).not.toBe(firstMesh)

        renderer.dispose()
    })
})
