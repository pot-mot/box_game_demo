import {Vec3} from 'cannon-es'
import type {EntityInfoSource} from '../entity/box/base/types/entity_info.ts'
import type {FragmentData} from '../entity/destroyed/types'
import type {TerrainContext} from '../entity/terrain/base/types'
import type {EntityType} from '../entity/constants.ts'
import type {SaveData, FragmentDataJSON, EntitySourceMap} from './types.ts'

/** JSON-safe 格式 → FragmentData */
const jsonToFragmentData = (j: FragmentDataJSON): FragmentData => ({
    renderVertices: new Float32Array(j.renderVertices),
    renderIndices: j.renderIndices,
    hullVertices: j.hullVertices.map(([x, y, z]) => new Vec3(x, y, z)),
    hullFaces: j.hullFaces,
    centroid: j.centroid,
    massRatio: j.massRatio,
    boxSize: j.boxSize,
})

/** 清空所有已有实体 */
export const clearAllEntities = (systems: Map<string, EntityInfoSource>, terrainSources: TerrainContext[]): void => {
    for (const [, source] of systems) {
        const ids = source.getEntityList().map(e => e.id)
        for (const id of ids) source.remove(id)
    }
    for (const ts of terrainSources) {
        const ids = ts.getEntityList().map(e => e.id)
        for (const id of ids) ts.remove(id)
    }
}

export interface LoadWorldResult {
    editCameraPos?: {x: number; y: number; z: number}
    editCameraRot?: {x: number; y: number; z: number}
    playCameraPos?: {x: number; y: number; z: number}
    playCameraRot?: {x: number; y: number; z: number}
    playPlayerPos?: {x: number; y: number; z: number}
}

const vec3FromTuple = (t?: [number, number, number]): {x: number; y: number; z: number} | undefined =>
    t ? {x: t[0], y: t[1], z: t[2]} : undefined

/** 从 SaveData 重建世界 */
export const loadWorldFromData = (
    data: SaveData,
    systems: Map<string, EntityInfoSource>,
    terrainSources: TerrainContext[],
): LoadWorldResult => {
    const getSource = <K extends EntityType>(key: K): EntitySourceMap[K] | undefined =>
        systems.get(key) as EntitySourceMap[K] | undefined

    const common = getSource('box/common')
    const dest = getSource('box/destruction')
    const burn = getSource('box/burning')
    const magnet = getSource('box/magnet')
    const elastic = getSource('box/elasticity')
    const water = getSource('area/water')
    const frag = getSource('fragment/common')
    const terrain = terrainSources[0]

    for (const entity of data.entities) {
        const [x, y, z] = entity.position
        const quat = entity.quaternion ? {x: entity.quaternion[0], y: entity.quaternion[1], z: entity.quaternion[2], w: entity.quaternion[3]} : undefined
        switch (entity.type) {
            case 'box/common':
                common?.add(entity.config, x, y, z, quat)
                break
            case 'box/destruction':
                dest?.add(entity.config, x, y, z, quat, {
                    health: entity.health,
                    collisions: entity.collisions,
                    collisionHistory: entity.collisionHistory,
                    cooldowns: entity.cooldowns ? new Map(entity.cooldowns) : undefined,
                })
                break
            case 'box/burning':
                burn?.add(entity.config, x, y, z, quat, {
                    health: entity.health,
                })
                break
            case 'box/magnet':
                magnet?.add(entity.config, x, y, z, quat)
                break
            case 'box/elasticity':
                elastic?.add(entity.config, x, y, z, quat, {
                    def: entity.def,
                    vel: entity.vel,
                })
                break
            case 'area/water':
                water?.add(entity.config, x, y, z, quat)
                break
            case 'terrain': {
                if (terrain) {
                    const e = terrain.add(entity.config, x, y, z, quat)
                    if (e && entity.heights !== undefined) terrain.setHeights(e.id, entity.heights)
                }
                break
            }
            case 'fragment/common': {
                const fd = jsonToFragmentData(entity.data)
                const [qx, qy, qz, qw] = entity.quaternion
                frag?.add(fd, 'saved', {x, y, z}, {x: qx, y: qy, z: qz, w: qw})
                break
            }
        }
    }

    const ei = data.modeInfo?.edit
    const pi = data.modeInfo?.play

    return {
        editCameraPos: vec3FromTuple(ei?.cameraInfo?.position),
        editCameraRot: vec3FromTuple(ei?.cameraInfo?.rotate),
        playCameraPos: vec3FromTuple(pi?.cameraInfo?.position),
        playCameraRot: vec3FromTuple(pi?.cameraInfo?.rotate),
        playPlayerPos: vec3FromTuple(pi?.playerInfo?.position),
    }
}
