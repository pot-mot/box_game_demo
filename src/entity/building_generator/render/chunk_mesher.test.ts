import {describe, expect, it} from 'vitest'
import {SURFACE_MATERIAL_INDEX} from '../../../render/materials/ids.ts'
import {CHUNK_SIZE} from '../constants.ts'
import {setBlock, type ChunkStore} from '../grid/block_world.ts'
import {buildChunkMeshData, buildLodChunkMeshData} from './chunk_mesher.ts'

const ROCK = SURFACE_MATERIAL_INDEX.rock
const SOIL = SURFACE_MATERIAL_INDEX.soil
const BRICK = SURFACE_MATERIAL_INDEX.brick
const WOOD = SURFACE_MATERIAL_INDEX.wood

const emptyStore = (): ChunkStore => new Map<string, Uint8Array>()

const quadCount = (mesh: {indices: number[]}): number => mesh.indices.length / 6

describe('chunk_mesher 贪心合并与隐藏面剔除', () => {
    it('单个孤立方块发射 6 个面', () => {
        const chunks = emptyStore()
        setBlock(chunks, 0, 0, 0, ROCK)
        const mesh = buildChunkMeshData(chunks, 0, 0, 0)!
        expect(quadCount(mesh)).toBe(6)
        expect(mesh.groups.length).toBe(1)
        expect(mesh.groups[0].materialIndex).toBe(ROCK - 1)
    })

    it('相邻同材质方块合并侧面（10 → 6 个四边形）', () => {
        const chunks = emptyStore()
        setBlock(chunks, 0, 0, 0, ROCK)
        setBlock(chunks, 1, 0, 0, ROCK)
        const mesh = buildChunkMeshData(chunks, 0, 0, 0)!
        expect(quadCount(mesh)).toBe(6)
    })

    it('实心 3×3×3 每个外表面合并为 1 个四边形（共 6 个）', () => {
        const chunks = emptyStore()
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) setBlock(chunks, x, y, z, ROCK)
            }
        }
        const mesh = buildChunkMeshData(chunks, 0, 0, 0)!
        expect(quadCount(mesh)).toBe(6)
        expect(mesh.groups.length).toBe(1)
    })

    it('不同材质不合并，按材质分组', () => {
        const chunks = emptyStore()
        setBlock(chunks, 0, 0, 0, BRICK)
        setBlock(chunks, 1, 0, 0, WOOD)
        const mesh = buildChunkMeshData(chunks, 0, 0, 0)!
        expect(mesh.groups.length).toBe(2)
        expect(mesh.groups.map(g => g.materialIndex).sort()).toEqual([BRICK - 1, WOOD - 1].sort())
    })

    it('跨 chunk 边界邻居为实心时剔除接缝面', () => {
        const chunks = emptyStore()
        setBlock(chunks, CHUNK_SIZE - 1, 0, 0, ROCK)
        setBlock(chunks, CHUNK_SIZE, 0, 0, ROCK)
        const mesh = buildChunkMeshData(chunks, 0, 0, 0)!
        expect(quadCount(mesh)).toBe(5)
    })

    it('合并后的 UV 以格数展开（保持每块纹理密度）', () => {
        const chunks = emptyStore()
        for (let x = 0; x < 3; x++) {
            for (let z = 0; z < 3; z++) setBlock(chunks, x, 0, z, ROCK)
        }
        const mesh = buildChunkMeshData(chunks, 0, 0, 0)!
        expect(Math.max(...mesh.uvs)).toBe(3)
    })

    it('非零 chunk 坐标的网格顶点带世界偏移', () => {
        const chunks = emptyStore()
        setBlock(chunks, CHUNK_SIZE, 0, 0, ROCK)
        const mesh = buildChunkMeshData(chunks, 1, 0, 0)!
        const xs = mesh.positions.filter((_, i) => i % 3 === 0)
        expect(Math.min(...xs)).toBe(CHUNK_SIZE)
        expect(Math.max(...xs)).toBe(CHUNK_SIZE + 1)
    })

    it('空 chunk 返回 undefined', () => {
        expect(buildChunkMeshData(emptyStore(), 0, 0, 0)).toBeUndefined()
    })
})

describe('chunk_mesher 粗 LOD 降采样', () => {
    it('粗格世界尺寸与 UV 按 stride 放大', () => {
        const chunks = emptyStore()
        setBlock(chunks, 0, 0, 0, ROCK)
        const mesh = buildLodChunkMeshData(chunks, 0, 0, 0, 4)!
        expect(quadCount(mesh)).toBe(6)
        expect(Math.max(...mesh.positions)).toBe(4)
        expect(Math.max(...mesh.uvs)).toBe(4)
    })

    it('交错材质经降采样取多数后大幅合并（三角形数显著下降）', () => {
        const chunks = emptyStore()
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                setBlock(chunks, x, 0, z, (x + z) % 2 === 0 ? ROCK : SOIL)
            }
        }
        const detail = buildChunkMeshData(chunks, 0, 0, 0)!
        const lod = buildLodChunkMeshData(chunks, 0, 0, 0, 4)!
        expect(quadCount(detail)).toBeGreaterThan(100)
        expect(quadCount(lod)).toBeLessThan(quadCount(detail))
    })

    it('非零 chunk 坐标的 LOD 网格顶点带世界偏移', () => {
        const chunks = emptyStore()
        setBlock(chunks, CHUNK_SIZE, 0, 0, ROCK)
        const mesh = buildLodChunkMeshData(chunks, 1, 0, 0, 4)!
        const xs = mesh.positions.filter((_, i) => i % 3 === 0)
        expect(Math.min(...xs)).toBe(CHUNK_SIZE)
        expect(Math.max(...xs)).toBe(CHUNK_SIZE + 4)
    })

    it('空 chunk 返回 undefined', () => {
        expect(buildLodChunkMeshData(emptyStore(), 0, 0, 0, 4)).toBeUndefined()
    })
})
