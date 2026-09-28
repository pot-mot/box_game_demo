import {describe, expect, it} from 'vitest'
import {SURFACE_MATERIAL_INDEX} from '../../../render/materials/ids.ts'
import {setBlock, parseChunkKey, type ChunkStore} from '../grid/block_world.ts'
import {encodeWorldChunks} from '../grid/world_codec.ts'
import {buildChunkMeshData} from './chunk_mesher.ts'

const ROCK = SURFACE_MATERIAL_INDEX.rock

/**
 * 性能回归护栏：大型实心区域（32³ = 32768 体素）的网格构建与存档编码
 * 必须在宽松预算内完成，且三角数受外表面面积约束（贪心合并生效）。
 * 阈值取得很宽松，仅用于捕获数量级退化（如贪心失效 / 意外 O(n²)）。
 */
describe('chunk_mesher 性能护栏', () => {
    it('32³ 实心区域：网格构建耗时与三角数受控', () => {
        const chunks: ChunkStore = new Map()
        const n = 32
        for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) {
                for (let z = 0; z < n; z++) setBlock(chunks, x, y, z, ROCK)
            }
        }
        const blocks = n * n * n

        const start = performance.now()
        let quads = 0
        for (const key of chunks.keys()) {
            const [cx, cy, cz] = parseChunkKey(key)
            const data = buildChunkMeshData(chunks, cx, cy, cz)
            if (data !== undefined) quads += data.indices.length / 6
        }
        const elapsed = performance.now() - start

        /* 贪心合并后三角数远小于体素数（仅外表面） */
        expect(quads).toBeLessThan(blocks / 10)
        expect(elapsed).toBeLessThan(2000)
    })

    it('32³ 实心区域：RLE 编码耗时与体积受控', () => {
        const chunks: ChunkStore = new Map()
        const n = 32
        for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) {
                for (let z = 0; z < n; z++) setBlock(chunks, x, y, z, ROCK)
            }
        }

        const start = performance.now()
        const encoded = encodeWorldChunks(chunks)
        const elapsed = performance.now() - start

        expect(encoded.chunks.length).toBeGreaterThan(0)
        expect(elapsed).toBeLessThan(2000)
        /* 实心区域 RLE 高度压缩：编码后字符数应远小于体素数 */
        const encodedChars = encoded.chunks.reduce((sum, chunk) => sum + chunk.rle.length, 0)
        expect(encodedChars).toBeLessThan(n * n * n)
    })
})
