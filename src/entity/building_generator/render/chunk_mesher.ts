import {MATERIAL_INDEX_TO_ID, SURFACE_MATERIAL_IDS} from '../../../render/materials/ids.ts'
import {CHUNK_SIZE, VOXEL_SIZE} from '../constants.ts'
import {chunkKey, getBlock, type ChunkStore} from '../grid/block_world.ts'

/** 一个材质分组在索引缓冲中的区间（供 `BufferGeometry.addGroup`） */
export interface ChunkMeshGroup {
    start: number
    count: number
    materialIndex: number
}

/** 一个 chunk 的网格几何数据（局部坐标；UV 以「格」为单位，配合 RepeatWrapping 平铺） */
export interface ChunkMeshData {
    positions: number[]
    normals: number[]
    uvs: number[]
    indices: number[]
    groups: ChunkMeshGroup[]
}

interface Bucket {
    positions: number[]
    normals: number[]
    uvs: number[]
    indices: number[]
}

const createBucket = (): Bucket => ({positions: [], normals: [], uvs: [], indices: []})

/**
 * 通用贪心网格构建：把 `cells³` 的网格中「材质非空且邻居为空」的面贪心合并为四边形。
 * `sample(x, y, z)` 返回坐标 [-1, cells] 处的材质索引（1..7，0 为空），用于跨边界邻居判定；
 * `origin` 为该网格在**世界局部坐标系**中的格坐标原点（= chunk 坐标 × cells），
 * 输出顶点位置会加上该原点，避免非零 chunk 的网格被错误地渲染到原点附近；
 * `cellWorldSize` 为单格世界边长，`uvScale` 为单格对应的纹理格数（细节层 1，LOD = stride）。
 */
const greedyMesh = (
    origin: readonly [number, number, number],
    cells: number,
    sample: (x: number, y: number, z: number) => number,
    cellWorldSize: number,
    uvScale: number,
): ChunkMeshData | undefined => {
    const buckets = new Map<number, Bucket>()
    const bucketFor = (materialIndex: number): Bucket => {
        let bucket = buckets.get(materialIndex)
        if (bucket === undefined) {
            bucket = createBucket()
            buckets.set(materialIndex, bucket)
        }
        return bucket
    }

    const coord = [0, 0, 0]
    const corner = [0, 0, 0]
    const normal = [0, 0, 0]
    const mask = new Int16Array(cells * cells)

    const emitQuad = (
        d: number, u: number, v: number, sign: number,
        materialIndex: number, slice: number,
        u0: number, u1: number, v0: number, v1: number,
    ): void => {
        const bucket = bucketFor(materialIndex)
        const plane = sign > 0 ? slice + 1 : slice
        const width = (u1 - u0) * uvScale
        const height = (v1 - v0) * uvScale
        const base = bucket.positions.length / 3
        /* 逆时针（从外侧看），UV 以格为单位展开 */
        const corners = sign > 0
            ? [[u0, v0, 0, 0], [u1, v0, width, 0], [u1, v1, width, height], [u0, v1, 0, height]]
            : [[u0, v0, 0, 0], [u0, v1, 0, height], [u1, v1, width, height], [u1, v0, width, 0]]
        for (const [uc, vc, tu, tv] of corners) {
            corner[d] = plane
            corner[u] = uc
            corner[v] = vc
            bucket.positions.push(
                (origin[0] + corner[0]) * cellWorldSize,
                (origin[1] + corner[1]) * cellWorldSize,
                (origin[2] + corner[2]) * cellWorldSize,
            )
            normal[0] = 0
            normal[1] = 0
            normal[2] = 0
            normal[d] = sign
            bucket.normals.push(normal[0], normal[1], normal[2])
            bucket.uvs.push(tu, tv)
        }
        bucket.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }

    for (let d = 0; d < 3; d++) {
        const u = (d + 1) % 3
        const v = (d + 2) % 3
        for (const sign of [1, -1]) {
            for (let slice = 0; slice < cells; slice++) {
                mask.fill(0)
                let any = false
                for (let ui = 0; ui < cells; ui++) {
                    for (let vi = 0; vi < cells; vi++) {
                        coord[d] = slice
                        coord[u] = ui
                        coord[v] = vi
                        const material = sample(coord[0], coord[1], coord[2])
                        if (material === 0) continue
                        coord[d] = slice + sign
                        if (sample(coord[0], coord[1], coord[2]) !== 0) continue
                        mask[ui * cells + vi] = material
                        any = true
                    }
                }
                if (!any) continue

                for (let ui = 0; ui < cells; ui++) {
                    for (let vi = 0; vi < cells;) {
                        const material = mask[ui * cells + vi]
                        if (material === 0) {
                            vi++
                            continue
                        }
                        let width = 1
                        while (vi + width < cells && mask[ui * cells + vi + width] === material) width++
                        let height = 1
                        grow: while (ui + height < cells) {
                            for (let k = 0; k < width; k++) {
                                if (mask[(ui + height) * cells + vi + k] !== material) break grow
                            }
                            height++
                        }
                        for (let a = 0; a < height; a++) {
                            for (let b = 0; b < width; b++) mask[(ui + a) * cells + vi + b] = 0
                        }
                        emitQuad(d, u, v, sign, material - 1, slice, ui, ui + height, vi, vi + width)
                        vi += width
                    }
                }
            }
        }
    }

    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const groups: ChunkMeshGroup[] = []
    for (let materialIndex = 0; materialIndex < SURFACE_MATERIAL_IDS.length; materialIndex++) {
        const bucket = buckets.get(materialIndex)
        if (bucket === undefined || bucket.indices.length === 0) continue
        const vertexOffset = positions.length / 3
        positions.push(...bucket.positions)
        normals.push(...bucket.normals)
        uvs.push(...bucket.uvs)
        groups.push({start: indices.length, count: bucket.indices.length, materialIndex})
        for (const index of bucket.indices) indices.push(index + vertexOffset)
    }

    if (indices.length === 0) return undefined
    return {positions, normals, uvs, indices, groups}
}

/** 全细节 chunk 网格（逐体素贪心合并） */
export const buildChunkMeshData = (chunks: ChunkStore, cx: number, cy: number, cz: number): ChunkMeshData | undefined => {
    if (chunks.get(chunkKey(cx, cy, cz)) === undefined) return undefined
    return greedyMesh(
        [cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE],
        CHUNK_SIZE,
        (x, y, z) => {
            const material = getBlock(chunks, cx * CHUNK_SIZE + x, cy * CHUNK_SIZE + y, cz * CHUNK_SIZE + z)
            return MATERIAL_INDEX_TO_ID[material] === undefined ? 0 : material
        },
        VOXEL_SIZE,
        1,
    )
}

/**
 * 粗 LOD chunk 网格：每 stride³ 个体素聚合为一个粗格（取多数材质），再对粗格做贪心合并。
 * 取样基于世界对齐的粗格坐标，相邻 chunk 的聚合边界一致，接缝无缝。
 */
export const buildLodChunkMeshData = (
    chunks: ChunkStore,
    cx: number,
    cy: number,
    cz: number,
    stride: number,
): ChunkMeshData | undefined => {
    if (chunks.get(chunkKey(cx, cy, cz)) === undefined) return undefined
    const cells = Math.floor(CHUNK_SIZE / stride)
    if (cells <= 0) return undefined

    const padded = cells + 2
    const grid = new Int16Array(padded * padded * padded)
    const counts = new Int16Array(SURFACE_MATERIAL_IDS.length + 1)
    const pidx = (x: number, y: number, z: number): number => (x * padded + y) * padded + z

    for (let px = 0; px < padded; px++) {
        for (let py = 0; py < padded; py++) {
            for (let pz = 0; pz < padded; pz++) {
                const gx = cx * cells + (px - 1)
                const gy = cy * cells + (py - 1)
                const gz = cz * cells + (pz - 1)
                counts.fill(0)
                for (let dx = 0; dx < stride; dx++) {
                    for (let dy = 0; dy < stride; dy++) {
                        for (let dz = 0; dz < stride; dz++) {
                            const material = getBlock(chunks, gx * stride + dx, gy * stride + dy, gz * stride + dz)
                            if (material !== 0 && MATERIAL_INDEX_TO_ID[material] !== undefined) counts[material]++
                        }
                    }
                }
                let best = 0
                let bestCount = 0
                for (let material = 1; material < counts.length; material++) {
                    if (counts[material] > bestCount) {
                        bestCount = counts[material]
                        best = material
                    }
                }
                grid[pidx(px, py, pz)] = best
            }
        }
    }

    return greedyMesh(
        [cx * cells, cy * cells, cz * cells],
        cells,
        (x, y, z) => grid[pidx(x + 1, y + 1, z + 1)],
        stride * VOXEL_SIZE,
        stride,
    )
}
