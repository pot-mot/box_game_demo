import {MATERIAL_INDEX_TO_ID, SURFACE_MATERIAL_INDEX, type SurfaceMaterialId} from '../../../render/materials/index.ts'
import {CHUNK_VOLUME} from '../constants.ts'
import type {BuildingChunkSaveData} from '../types/index.ts'
import {chunkHasBlocks, chunkKey, parseChunkKey, type ChunkStore} from './block_world.ts'
import {decodeRle, encodeRle} from './rle.ts'

export interface EncodedWorldChunks {
    /** RLE 值（1 起）对应的材质 id；0 恒为空 */
    palette: SurfaceMaterialId[]
    chunks: BuildingChunkSaveData[]
}

/**
 * 把体素网格编码为存档数据：收集出现过的材质作为调色板，每 chunk 以调色板局部索引做 RLE。
 * 空 chunk 跳过。
 */
export const encodeWorldChunks = (chunks: ChunkStore): EncodedWorldChunks => {
    const used = new Set<SurfaceMaterialId>()
    for (const data of chunks.values()) {
        for (const v of data) {
            if (v === 0) continue
            const material = MATERIAL_INDEX_TO_ID[v]
            if (material !== undefined) used.add(material)
        }
    }
    const palette = Array.from(used)
    const localOf = new Map<SurfaceMaterialId, number>()
    palette.forEach((material, i) => localOf.set(material, i + 1))

    const savedChunks: BuildingChunkSaveData[] = []
    for (const [key, data] of chunks) {
        if (!chunkHasBlocks(data)) continue
        const mapped = new Uint8Array(data.length)
        for (let i = 0; i < data.length; i++) {
            const v = data[i]
            if (v === 0) continue
            const material = MATERIAL_INDEX_TO_ID[v]
            mapped[i] = material === undefined ? 0 : (localOf.get(material) ?? 0)
        }
        savedChunks.push({key: parseChunkKey(key), rle: encodeRle(mapped)})
    }
    return {palette, chunks: savedChunks}
}

/**
 * 把存档数据解码回体素网格：非法 / 长度不符的 chunk 安全跳过，未知材质回退为空。
 */
export const decodeWorldChunks = (palette: SurfaceMaterialId[], saved: BuildingChunkSaveData[]): ChunkStore => {
    const chunks: ChunkStore = new Map()
    const idByLocal: Array<SurfaceMaterialId | undefined> = [undefined, ...palette]
    for (const chunk of saved) {
        const decoded = decodeRle(chunk.rle, CHUNK_VOLUME)
        if (decoded === undefined) continue
        const remapped = new Uint8Array(decoded.length)
        let hasBlocks = false
        for (let i = 0; i < decoded.length; i++) {
            const v = decoded[i]
            if (v === 0) continue
            const material = idByLocal[v]
            const index = material === undefined ? 0 : SURFACE_MATERIAL_INDEX[material]
            remapped[i] = index
            if (index !== 0) hasBlocks = true
        }
        if (!hasBlocks) continue
        chunks.set(chunkKey(chunk.key[0], chunk.key[1], chunk.key[2]), remapped)
    }
    return chunks
}
