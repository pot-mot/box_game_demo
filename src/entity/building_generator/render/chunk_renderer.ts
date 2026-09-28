import {BufferGeometry, Float32BufferAttribute, Mesh, Vector3, type Group} from 'three'
import {getSurfaceMaterials} from '../../../render/materials/index.ts'
import {
    CHUNK_SIZE, LOD_CHUNK_RADIUS, LOD_DETAIL_HYSTERESIS_CHUNKS, LOD_STRIDE,
    MAX_CHUNK_MESH_BUILDS_PER_FRAME, RENDER_CHUNK_RADIUS, UNLOAD_HYSTERESIS_CHUNKS, VOXEL_SIZE,
} from '../constants.ts'
import {parseChunkKey, type ChunkStore} from '../grid/block_world.ts'
import {buildChunkMeshData, buildLodChunkMeshData, type ChunkMeshData} from './chunk_mesher.ts'

/** 全细节距离（世界单位） */
const DETAIL_DISTANCE = RENDER_CHUNK_RADIUS * CHUNK_SIZE * VOXEL_SIZE
/** 细节 / LOD 切换内边界（世界单位，含滞回） */
const DETAIL_INNER_DISTANCE = Math.max(0, DETAIL_DISTANCE - LOD_DETAIL_HYSTERESIS_CHUNKS * CHUNK_SIZE * VOXEL_SIZE)
/** 可见（粗 LOD）距离（世界单位） */
const LOD_DISTANCE = LOD_CHUNK_RADIUS * CHUNK_SIZE * VOXEL_SIZE
/** 卸载距离（世界单位，含滞回） */
const UNLOAD_DISTANCE = (LOD_CHUNK_RADIUS + UNLOAD_HYSTERESIS_CHUNKS) * CHUNK_SIZE * VOXEL_SIZE

const DETAIL_DISTANCE_SQ = DETAIL_DISTANCE * DETAIL_DISTANCE
const DETAIL_INNER_DISTANCE_SQ = DETAIL_INNER_DISTANCE * DETAIL_INNER_DISTANCE
const LOD_DISTANCE_SQ = LOD_DISTANCE * LOD_DISTANCE
const UNLOAD_DISTANCE_SQ = UNLOAD_DISTANCE * UNLOAD_DISTANCE

/** 网格层级：全细节 / 粗 LOD */
type MeshTier = 'detail' | 'lod'

interface ChunkRecord {
    tier: MeshTier
    mesh: Mesh
}

/** 单个建筑世界的分块网格渲染器 */
export interface WorldMeshRenderer {
    update: (cameraLocal: Vector3) => void
    /** 全细节层网格（体素拾取 / AI 感知用；不含粗 LOD） */
    getPickMeshes: () => Mesh[]
    /** 释放全部已构建网格与空缓存（重建体素前调用） */
    clear: () => void
    dispose: () => void
}

/** chunk 中心（局部坐标，与体素网格同一坐标系） */
const chunkCenter = (out: Vector3, cx: number, cy: number, cz: number): void => {
    out.set(
        (cx + 0.5) * CHUNK_SIZE * VOXEL_SIZE,
        (cy + 0.5) * CHUNK_SIZE * VOXEL_SIZE,
        (cz + 0.5) * CHUNK_SIZE * VOXEL_SIZE,
    )
}

/** 由网格数据创建 Three Mesh（按材质分组，共享材质单例） */
const createChunkMesh = (data: ChunkMeshData): Mesh => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(data.positions, 3))
    geometry.setAttribute('normal', new Float32BufferAttribute(data.normals, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(data.uvs, 2))
    geometry.setIndex(data.indices)
    const materials = getSurfaceMaterials()
    for (const group of data.groups) geometry.addGroup(group.start, group.count, group.materialIndex)
    /* 单材质时直接传材质，避免多材质数组的额外分支开销 */
    return data.groups.length === 1
        ? new Mesh(geometry, materials[data.groups[0].materialIndex])
        : new Mesh(geometry, materials)
}

/**
 * 创建分块网格渲染器：近处全细节、中距离粗 LOD（降采样合并）、远处卸载（保留数据）。
 * 每帧构建数量受预算限制以摊还构建开销；层级切换与半径均带滞回避免边界抖动。
 */
export const createWorldMeshRenderer = (parent: Group, chunks: ChunkStore, dirty: Set<string>): WorldMeshRenderer => {
    const records = new Map<string, ChunkRecord>()
    /** 已知无可见面的 chunk，避免每帧重复尝试构建 */
    const emptyChunks = new Set<string>()
    const center = new Vector3()

    const disposeRecord = (key: string): void => {
        const record = records.get(key)
        if (record === undefined) return
        parent.remove(record.mesh)
        /* 材质为共享单例，只释放几何体 */
        record.mesh.geometry.dispose()
        records.delete(key)
    }

    const build = (key: string, tier: MeshTier): void => {
        const [cx, cy, cz] = parseChunkKey(key)
        const data = tier === 'detail'
            ? buildChunkMeshData(chunks, cx, cy, cz)
            : buildLodChunkMeshData(chunks, cx, cy, cz, LOD_STRIDE)
        if (data === undefined) {
            emptyChunks.add(key)
            return
        }
        const mesh = createChunkMesh(data)
        parent.add(mesh)
        records.set(key, {tier, mesh})
    }

    const tierFor = (current: MeshTier, distSq: number): MeshTier =>
        current === 'detail'
            ? (distSq <= DETAIL_DISTANCE_SQ ? 'detail' : 'lod')
            : (distSq <= DETAIL_INNER_DISTANCE_SQ ? 'detail' : 'lod')

    const update = (cameraLocal: Vector3): void => {
        /* 数据变更：失效已渲染网格与空缓存，交由下方按需重建 */
        for (const key of dirty) {
            disposeRecord(key)
            emptyChunks.delete(key)
        }
        dirty.clear()

        /* 卸载超出阈值 / 切换层级的网格 */
        for (const [key, record] of records) {
            const [cx, cy, cz] = parseChunkKey(key)
            chunkCenter(center, cx, cy, cz)
            const distSq = center.distanceToSquared(cameraLocal)
            if (distSq > UNLOAD_DISTANCE_SQ || tierFor(record.tier, distSq) !== record.tier) {
                disposeRecord(key)
            }
        }

        /* 收集可见距离内、尚无网格的 chunk，按距离由近到远构建 */
        const candidates: Array<{key: string; tier: MeshTier; distSq: number}> = []
        for (const key of chunks.keys()) {
            if (records.has(key) || emptyChunks.has(key)) continue
            const [cx, cy, cz] = parseChunkKey(key)
            chunkCenter(center, cx, cy, cz)
            const distSq = center.distanceToSquared(cameraLocal)
            if (distSq > LOD_DISTANCE_SQ) continue
            candidates.push({key, tier: distSq <= DETAIL_DISTANCE_SQ ? 'detail' : 'lod', distSq})
        }
        if (candidates.length === 0) return
        candidates.sort((a, b) => a.distSq - b.distSq)
        const budget = Math.min(candidates.length, MAX_CHUNK_MESH_BUILDS_PER_FRAME)
        for (let i = 0; i < budget; i++) build(candidates[i].key, candidates[i].tier)
    }

    return {
        update,
        getPickMeshes: () => {
            const meshes: Mesh[] = []
            for (const record of records.values()) {
                if (record.tier === 'detail') meshes.push(record.mesh)
            }
            return meshes
        },
        clear: () => {
            for (const key of Array.from(records.keys())) disposeRecord(key)
            emptyChunks.clear()
            dirty.clear()
        },
        dispose: () => {
            for (const key of Array.from(records.keys())) disposeRecord(key)
            dirty.clear()
        },
    }
}
