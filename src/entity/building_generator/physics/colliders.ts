import RAPIER from '@dimforge/rapier3d-compat'
import {Vector3} from 'three'
import {categoryCollisionGroups} from '../../../physics/collision_category.ts'
import {createColliderForBody} from '../../../physics/rapier_utils.ts'
import {BUILDING_COLLISION_GROUP, BUILDING_COLLISION_MASK} from '../../../physics/constants.ts'
import {CHUNK_SIZE, MAX_CHUNK_COLLIDER_BUILDS_PER_FRAME, PHYSICS_CHUNK_RADIUS, UNLOAD_HYSTERESIS_CHUNKS, VOXEL_SIZE} from '../constants.ts'
import {parseChunkKey, type ChunkStore} from '../grid/block_world.ts'
import {buildChunkMeshData} from '../render/chunk_mesher.ts'

const PHYSICS_DISTANCE = PHYSICS_CHUNK_RADIUS * CHUNK_SIZE * VOXEL_SIZE
const UNLOAD_DISTANCE = (PHYSICS_CHUNK_RADIUS + UNLOAD_HYSTERESIS_CHUNKS) * CHUNK_SIZE * VOXEL_SIZE

/** 单个建筑世界的近处合并 trimesh 碰撞体管理器 */
export interface WorldColliderManager {
    update: (cameraLocal: Vector3, dirty: Set<string>) => void
    /** 移除全部碰撞体与空缓存（重建体素前调用） */
    clear: () => void
    dispose: () => void
}

const chunkCenter = (out: Vector3, cx: number, cy: number, cz: number): void => {
    out.set(
        (cx + 0.5) * CHUNK_SIZE * VOXEL_SIZE,
        (cy + 0.5) * CHUNK_SIZE * VOXEL_SIZE,
        (cz + 0.5) * CHUNK_SIZE * VOXEL_SIZE,
    )
}

/**
 * 创建碰撞体管理器：仅为玩家附近的 chunk 生成合并 trimesh（复用渲染的面剔除几何），
 * 远处移除碰撞体但保留数据；每帧构建数量受预算限制。
 */
export const createWorldColliderManager = (
    rapierWorld: RAPIER.World,
    body: RAPIER.RigidBody,
    chunks: ChunkStore,
): WorldColliderManager => {
    const colliders = new Map<string, RAPIER.Collider>()
    /** 已知无可见面的 chunk，避免每帧重复尝试构建（数据变更时清除） */
    const emptyChunks = new Set<string>()
    const center = new Vector3()

    const removeCollider = (key: string): void => {
        const collider = colliders.get(key)
        if (collider === undefined) return
        rapierWorld.removeCollider(collider, true)
        colliders.delete(key)
    }

    const build = (key: string): void => {
        const [cx, cy, cz] = parseChunkKey(key)
        const data = buildChunkMeshData(chunks, cx, cy, cz)
        if (data === undefined) {
            emptyChunks.add(key)
            return
        }
        const vertices = new Float32Array(data.positions)
        const indices = new Uint32Array(data.indices)
        const desc = RAPIER.ColliderDesc.trimesh(vertices, indices)
            .setFriction(0.6)
            .setCollisionGroups(categoryCollisionGroups(BUILDING_COLLISION_GROUP, BUILDING_COLLISION_MASK, 'building'))
        colliders.set(key, createColliderForBody(rapierWorld, desc, body))
    }

    const update = (cameraLocal: Vector3, dirty: Set<string>): void => {
        const physicsDistSq = PHYSICS_DISTANCE * PHYSICS_DISTANCE
        const unloadDistSq = UNLOAD_DISTANCE * UNLOAD_DISTANCE

        for (const key of dirty) {
            removeCollider(key)
            emptyChunks.delete(key)
        }
        dirty.clear()

        for (const key of colliders.keys()) {
            const [cx, cy, cz] = parseChunkKey(key)
            chunkCenter(center, cx, cy, cz)
            if (center.distanceToSquared(cameraLocal) > unloadDistSq) removeCollider(key)
        }

        const candidates: Array<{key: string; distSq: number}> = []
        for (const key of chunks.keys()) {
            if (colliders.has(key) || emptyChunks.has(key)) continue
            const [cx, cy, cz] = parseChunkKey(key)
            chunkCenter(center, cx, cy, cz)
            const distSq = center.distanceToSquared(cameraLocal)
            if (distSq <= physicsDistSq) candidates.push({key, distSq})
        }
        if (candidates.length === 0) return
        candidates.sort((a, b) => a.distSq - b.distSq)
        const budget = Math.min(candidates.length, MAX_CHUNK_COLLIDER_BUILDS_PER_FRAME)
        for (let i = 0; i < budget; i++) build(candidates[i].key)
    }

    return {
        update,
        clear: () => {
            for (const key of Array.from(colliders.keys())) removeCollider(key)
            emptyChunks.clear()
        },
        dispose: () => {
            for (const key of Array.from(colliders.keys())) removeCollider(key)
        },
    }
}
