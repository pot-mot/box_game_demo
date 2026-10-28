import {v3} from '../physics/rapier_utils.ts'
import type {EntityInfoSource} from '../entity/box/base/types/entity_info.ts'
import type {FragmentData} from '../entity/destroyed/types'
import type {TerrainContext} from '../entity/terrain/base/types'
import type {EntityType} from '../entity/constants.ts'
import type {SaveData, FragmentDataJSON, EntitySourceMap, SavableEntity} from './types.ts'
import type {OwnershipStore} from '../types/ownership_store.ts'
import {bodyFormOf} from '../entity/character/body_form/index.ts'

/** JSON-safe 格式 → FragmentData */
const jsonToFragmentData = (j: FragmentDataJSON): FragmentData => ({
    renderVertices: new Float32Array(j.renderVertices),
    renderIndices: j.renderIndices,
    hullVertices: j.hullVertices.map(([x, y, z]) => v3(x, y, z)),
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
    boneEditCameraPos?: {x: number; y: number; z: number}
    boneEditCameraRot?: {x: number; y: number; z: number}
}

const vec3FromTuple = (t?: [number, number, number]): {x: number; y: number; z: number} | undefined =>
    t ? {x: t[0], y: t[1], z: t[2]} : undefined

/** 从 SaveData 重建世界 */
export const loadWorldFromData = (
    data: SaveData,
    systems: Map<string, EntityInfoSource>,
    terrainSources: TerrainContext[],
    ownership?: OwnershipStore,
): LoadWorldResult => {
    const getSource = <K extends EntityType>(key: K): EntitySourceMap[K] | undefined =>
        systems.get(key) as EntitySourceMap[K] | undefined

    const boxes = getSource('box')
    const areas = getSource('area')
    const frag = getSource('fragment/common')
    const building = getSource('building_generator')
    const interactable = getSource('interactable')
    const itemEntities = getSource('item')
    const character = getSource('character')
    const diorama = getSource('diorama')
    const slopeBlocks = getSource('slope_block')
    const terrain = terrainSources[0]
    /* v1 旧档：character 位置为身体中心，需下移半高迁移到脚底原点语义（v2 起即为脚底原点，不再迁移） */
    const legacyCharacterPos = (data.version ?? 1) < 2

    /* 交互物按批重建（loadSave 会先清空既有交互物） */
    if (interactable !== undefined) {
        const entries = data.entities
            .filter((e): e is Extract<SavableEntity, {type: 'interactable'}> => e.type === 'interactable')
        const ids = interactable.loadSave(entries.map(e => ({
            config: e.config,
            position: e.position,
            yawQuarter: e.yawQuarter,
            progress: e.progress,
            target: e.target,
            on: e.on,
            container: e.container,
            health: e.health,
        })))
        entries.forEach((entry, i) => {
            const id = ids[i]
            if (id !== undefined && entry.owner !== undefined) {
                ownership?.set({type: 'interactable', runtimeId: id}, entry.owner)
            }
        })
    }

    /* 掉落物按批重建（loadSave 会先清空既有掉落物） */
    if (itemEntities !== undefined) {
        const entries = data.entities
            .filter((e): e is Extract<SavableEntity, {type: 'item'}> => e.type === 'item')
        const ids = itemEntities.loadSave(entries.map(e => ({
            defId: e.config.defId,
            count: e.config.count,
            position: e.position,
            quaternion: e.quaternion,
        })))
        entries.forEach((entry, i) => {
            const id = ids[i]
            if (id !== undefined && entry.owner !== undefined) {
                ownership?.set({type: 'item', runtimeId: id}, entry.owner)
            }
        })
    }

    for (const entity of data.entities) {
        /* building_generator 无独立变换字段（origin 在 worlds 内）；diorama 使用 origin 字段 */
        const [x, y, z] = 'position' in entity
            ? entity.position
            : entity.type === 'diorama' ? entity.origin : [0, 0, 0] as [number, number, number]
        const rawQuat = 'quaternion' in entity ? entity.quaternion : undefined
        const quat = rawQuat ? {x: rawQuat[0], y: rawQuat[1], z: rawQuat[2], w: rawQuat[3]} : undefined
        switch (entity.type) {
            case 'box': {
                const added = boxes?.add(entity.config, x, y, z, quat, {
                    destructible: entity.destructible ? {
                        health: entity.destructible.health,
                        collisions: entity.destructible.collisions,
                        collisionHistory: entity.destructible.collisionHistory,
                        cooldowns: entity.destructible.cooldowns ? new Map(entity.destructible.cooldowns) : undefined,
                    } : undefined,
                    burning: entity.burning ? {health: entity.burning.health} : undefined,
                    elastic: entity.elastic ? {def: entity.elastic.def, vel: entity.elastic.vel} : undefined,
                })
                if (added !== undefined && entity.owner !== undefined) {
                    ownership?.set({type: 'box', runtimeId: added.id}, entity.owner)
                }
                break
            }
            case 'area': {
                const added = areas?.add(entity.config, x, y, z, quat)
                if (added !== undefined && entity.owner !== undefined) {
                    ownership?.set({type: 'area', runtimeId: added.id}, entity.owner)
                }
                break
            }
            case 'slope_block': {
                const added = slopeBlocks?.add(entity.config, x, y, z, quat)
                if (added !== undefined && entity.owner !== undefined) {
                    ownership?.set({type: 'slope_block', runtimeId: added.id}, entity.owner)
                }
                break
            }
            case 'terrain': {
                if (terrain) {
                    const e = terrain.add(entity.config, x, y, z, quat)
                    if (e && entity.heights !== undefined) terrain.setHeights(e.id, entity.heights)
                    if (e && entity.owner !== undefined) {
                        ownership?.set({type: 'terrain', runtimeId: e.id}, entity.owner)
                    }
                }
                break
            }
            case 'building_generator': {
                const created = building?.loadSaveWorlds(entity.worlds) ?? []
                entity.worlds.forEach((world, i) => {
                    const loaded = created[i]
                    if (loaded !== undefined && world.owner !== undefined) {
                        ownership?.set({type: 'building_generator', runtimeId: loaded.id}, world.owner)
                    }
                })
                break
            }
            case 'fragment/common': {
                const fd = jsonToFragmentData(entity.data)
                if (fd.hullVertices.length === 0 || fd.hullFaces.length === 0) break
                const [qx, qy, qz, qw] = entity.quaternion
                const added = frag?.add(fd, 'saved', {x, y, z}, {x: qx, y: qy, z: qz, w: qw})
                if (added !== undefined && entity.owner !== undefined) {
                    ownership?.set({type: 'fragment/common', runtimeId: added.id}, entity.owner)
                }
                break
            }
            case 'diorama': {
                /* 读档不自动重生：子实体以各自存档条目恢复，箱庭只恢复蓝图与根变换 */
                const added = diorama?.add(entity.blueprint, x, y, z, entity.yawQuarter, entity.dioramaId, false)
                if (added !== undefined && entity.owner !== undefined) {
                    ownership?.set({type: 'diorama', runtimeId: added.id}, entity.owner)
                }
                break
            }
            case 'character': {
                /* 旧档迁移：身体中心 Y → 脚底原点 Y（按体形计划的中心偏移；缺省 humanoid） */
                const halfH = bodyFormOf(entity.config.bodyFormId).base.centerOffsetY * entity.config.scale
                const feetY = legacyCharacterPos ? y - halfH : y
                const spawned = character?.add(entity.config, x, feetY, z, quat, {health: entity.health})
                /* 朝向恢复（旧存档无 facing 字段时保持缺省 0） */
                if (spawned !== undefined && entity.facing !== undefined) {
                    character?.setFacing(spawned.id, entity.facing)
                }
                if (spawned !== undefined && entity.owner !== undefined) {
                    ownership?.set({type: 'character', runtimeId: spawned.id}, entity.owner)
                }
                break
            }
        }
    }

    const ei = data.modeInfo?.edit
    const pi = data.modeInfo?.play
    const bi = data.modeInfo?.boneEdit

    return {
        editCameraPos: vec3FromTuple(ei?.cameraInfo?.position),
        editCameraRot: vec3FromTuple(ei?.cameraInfo?.rotate),
        playCameraPos: vec3FromTuple(pi?.cameraInfo?.position),
        playCameraRot: vec3FromTuple(pi?.cameraInfo?.rotate),
        boneEditCameraPos: vec3FromTuple(bi?.cameraInfo?.position),
        boneEditCameraRot: vec3FromTuple(bi?.cameraInfo?.rotate),
    }
}
