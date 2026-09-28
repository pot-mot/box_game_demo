import {describe, expect, it} from 'vitest'
import {SURFACE_MATERIAL_INDEX} from '../../../render/materials/index.ts'
import {getBlock, setBlock, type ChunkStore} from './block_world.ts'
import {decodeWorldChunks, encodeWorldChunks} from './world_codec.ts'

const emptyStore = (): ChunkStore => new Map<string, Uint8Array>()

describe('world_codec 往返', () => {
    it('编码解码后体素一致（含跨 chunk）', () => {
        const chunks = emptyStore()
        setBlock(chunks, 0, 0, 0, SURFACE_MATERIAL_INDEX.brick)
        setBlock(chunks, 1, 0, 0, SURFACE_MATERIAL_INDEX.wood)
        setBlock(chunks, 20, 5, -3, SURFACE_MATERIAL_INDEX.rock)

        const encoded = encodeWorldChunks(chunks)
        expect(encoded.palette.length).toBe(3)
        const decoded = decodeWorldChunks(encoded.palette, encoded.chunks)

        expect(getBlock(decoded, 0, 0, 0)).toBe(SURFACE_MATERIAL_INDEX.brick)
        expect(getBlock(decoded, 1, 0, 0)).toBe(SURFACE_MATERIAL_INDEX.wood)
        expect(getBlock(decoded, 20, 5, -3)).toBe(SURFACE_MATERIAL_INDEX.rock)
        expect(getBlock(decoded, 2, 0, 0)).toBe(0)
    })

    it('未知调色板条目回退为空（不抛错）', () => {
        const chunks = emptyStore()
        setBlock(chunks, 0, 0, 0, SURFACE_MATERIAL_INDEX.tile)
        const encoded = encodeWorldChunks(chunks)
        const decoded = decodeWorldChunks([], encoded.chunks)
        expect(decoded.size).toBe(0)
    })

    it('空 chunk 不写入存档', () => {
        const chunks = emptyStore()
        setBlock(chunks, 0, 0, 0, SURFACE_MATERIAL_INDEX.rock)
        setBlock(chunks, 0, 0, 0, 0)
        const encoded = encodeWorldChunks(chunks)
        expect(encoded.chunks.length).toBe(0)
        expect(encoded.palette.length).toBe(0)
    })

    it('大面积同材质压缩后 RLE 体积远小于原始', () => {
        const chunks = emptyStore()
        for (let x = 0; x < 16; x++) {
            for (let z = 0; z < 16; z++) setBlock(chunks, x, 0, z, SURFACE_MATERIAL_INDEX.soil)
        }
        const encoded = encodeWorldChunks(chunks)
        expect(encoded.chunks.length).toBe(1)
        const bytes = encoded.chunks[0].rle.length
        expect(bytes).toBeLessThan(4096)
    })
})
