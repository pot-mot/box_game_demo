import {describe, expect, it} from 'vitest'
import {CHUNK_SIZE, CHUNK_VOLUME} from '../constants.ts'
import {chunkCoordOf, chunkHasBlocks, chunkKey, chunkLocalOf, getBlock, parseChunkKey, setBlock} from './block_world.ts'

describe('block_world', () => {
    it('读写正坐标体素', () => {
        const chunks = new Map<string, Uint8Array>()
        setBlock(chunks, 3, 4, 5, 7)
        expect(getBlock(chunks, 3, 4, 5)).toBe(7)
        expect(getBlock(chunks, 3, 4, 6)).toBe(0)
        expect(chunks.size).toBe(1)
    })

    it('支持负坐标且归入正确 chunk', () => {
        const chunks = new Map<string, Uint8Array>()
        setBlock(chunks, -1, -1, -1, 3)
        expect(getBlock(chunks, -1, -1, -1)).toBe(3)
        expect(chunks.has(chunkKey(-1, -1, -1))).toBe(true)
        expect(chunkCoordOf(-1)).toBe(-1)
        expect(chunkLocalOf(-1)).toBe(CHUNK_SIZE - 1)
    })

    it('跨 chunk 边界互不干扰', () => {
        const chunks = new Map<string, Uint8Array>()
        setBlock(chunks, CHUNK_SIZE - 1, 0, 0, 1)
        setBlock(chunks, CHUNK_SIZE, 0, 0, 2)
        expect(getBlock(chunks, CHUNK_SIZE - 1, 0, 0)).toBe(1)
        expect(getBlock(chunks, CHUNK_SIZE, 0, 0)).toBe(2)
        expect(chunks.size).toBe(2)
    })

    it('清除已分配 chunk 的体素不报错，写入未分配空 chunk 的 0 不分配', () => {
        const chunks = new Map<string, Uint8Array>()
        setBlock(chunks, 0, 0, 0, 0)
        expect(chunks.size).toBe(0)
        setBlock(chunks, 1, 1, 1, 5)
        setBlock(chunks, 1, 1, 1, 0)
        expect(getBlock(chunks, 1, 1, 1)).toBe(0)
        expect(chunks.size).toBe(1)
    })

    it('chunkHasBlocks 判定', () => {
        expect(chunkHasBlocks(new Uint8Array(CHUNK_VOLUME))).toBe(false)
        const data = new Uint8Array(CHUNK_VOLUME)
        data[CHUNK_VOLUME - 1] = 2
        expect(chunkHasBlocks(data)).toBe(true)
    })

    it('parseChunkKey 还原坐标', () => {
        expect(parseChunkKey(chunkKey(-3, 0, 5))).toEqual([-3, 0, 5])
    })
})
