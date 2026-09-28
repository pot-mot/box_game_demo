import {CHUNK_SIZE, CHUNK_VOLUME} from '../constants.ts'

/** 稀疏 chunk 存储：chunk 键 → 体素调色板索引数组（0 = 空） */
export type ChunkStore = Map<string, Uint8Array>

/** chunk 坐标 → 存储键 */
export const chunkKey = (cx: number, cy: number, cz: number): string => `${cx},${cy},${cz}`

/** 解析 chunk 键为坐标 */
export const parseChunkKey = (key: string): [number, number, number] => {
    const parts = key.split(',')
    return [Number(parts[0]), Number(parts[1]), Number(parts[2])]
}

/** 体素坐标 → chunk 坐标（向下取整，支持负坐标） */
export const chunkCoordOf = (v: number): number => Math.floor(v / CHUNK_SIZE)

/** 体素坐标 → chunk 内局部坐标（支持负坐标） */
export const chunkLocalOf = (v: number): number => ((v % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE

/** chunk 内局部坐标 → 数组索引 */
const chunkIndex = (lx: number, ly: number, lz: number): number =>
    (lx * CHUNK_SIZE + ly) * CHUNK_SIZE + lz

/** 读取体素索引（0 = 空） */
export const getBlock = (chunks: ChunkStore, x: number, y: number, z: number): number => {
    const data = chunks.get(chunkKey(chunkCoordOf(x), chunkCoordOf(y), chunkCoordOf(z)))
    if (data === undefined) return 0
    return data[chunkIndex(chunkLocalOf(x), chunkLocalOf(y), chunkLocalOf(z))]
}

/** 写入体素索引（0 表示清除；未分配的空 chunk 不创建） */
export const setBlock = (chunks: ChunkStore, x: number, y: number, z: number, value: number): void => {
    const key = chunkKey(chunkCoordOf(x), chunkCoordOf(y), chunkCoordOf(z))
    let data = chunks.get(key)
    if (data === undefined) {
        if (value === 0) return
        data = new Uint8Array(CHUNK_VOLUME)
        chunks.set(key, data)
    }
    data[chunkIndex(chunkLocalOf(x), chunkLocalOf(y), chunkLocalOf(z))] = value
}

/** chunk 是否含至少一个非空体素 */
export const chunkHasBlocks = (data: Uint8Array): boolean => {
    for (let i = 0; i < data.length; i++) {
        if (data[i] !== 0) return true
    }
    return false
}
