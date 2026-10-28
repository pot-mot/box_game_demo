import {Euler, Quaternion, type Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../physics/world.ts'
import {BUILDING_COLLISION_GROUP, BUILDING_COLLISION_MASK} from '../../../physics/constants.ts'
import {categoryCollisionGroups} from '../../../physics/collision_category.ts'
import type {EntityPanelInfo} from '../../box/base/types/entity_info.ts'
import type {XYZ} from '../../box/base/types/index.ts'
import {createEmitter, type SourceEventMap} from '../../box/base/types/event_emitter.ts'
import {SLOPE_BLOCK_FRICTION} from '../constants.ts'
import {buildSlopeBlockTrimesh, createSlopeBlockMesh, disposeSlopeBlockMesh} from '../render/index.ts'
import type {SlopeBlockContext, SlopeBlockEntity} from '../types.ts'
import {DEFAULT_SLOPE_BLOCK_CONFIG, type SlopeBlockConfig} from '../validation.ts'
import {createSlopeBlockPanel} from '../ui/index.ts'

const TYPE = 'slope_block' as const
const BADGE_LABEL = 'S'
const BADGE_COLOR = '#7a6a4a'

const formatRowText = (entity: SlopeBlockEntity): string => {
    const p = entity.mesh.position
    return `#${entity.id}  (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  ${entity.config.size} ${entity.config.axis}  ${entity.config.material}`
}

export const setupSlopeBlocks = (scene: Scene, shared: SharedWorld): SlopeBlockContext => {
    const {world} = shared
    const entities: SlopeBlockEntity[] = []
    const byId = new Map<number, SlopeBlockEntity>()
    const panelInfo: EntityPanelInfo[] = []
    const events = createEmitter<SourceEventMap>()
    let nextId = 1
    let selectedId: number | undefined

    const rebuildPanelInfo = (): void => {
        panelInfo.length = 0
        for (const entity of entities) {
            panelInfo.push({
                id: entity.id,
                type: TYPE,
                badgeLabel: BADGE_LABEL,
                badgeColor: BADGE_COLOR,
                rowText: entity.rowText,
            })
        }
    }

    const refreshRowText = (entity: SlopeBlockEntity): void => {
        entity.rowText = formatRowText(entity)
    }

    const createCollider = (body: RAPIER.RigidBody, config: SlopeBlockConfig): RAPIER.Collider => {
        const mesh = buildSlopeBlockTrimesh(config)
        const desc = RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices)
            .setFriction(SLOPE_BLOCK_FRICTION)
            .setCollisionGroups(categoryCollisionGroups(BUILDING_COLLISION_GROUP, BUILDING_COLLISION_MASK, 'building'))
        return world.createCollider(desc, body)
    }

    const add = (
        config: SlopeBlockConfig,
        x: number,
        y: number,
        z: number,
        quat?: {x: number; y: number; z: number; w: number},
    ): SlopeBlockEntity => {
        const id = nextId++
        const mesh = createSlopeBlockMesh(config)
        mesh.position.set(x, y, z)
        if (quat !== undefined) mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w)
        scene.add(mesh)

        const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z)
        if (quat !== undefined) bodyDesc.setRotation(quat)
        const body = world.createRigidBody(bodyDesc)
        const collider = createCollider(body, config)

        const entity: SlopeBlockEntity = {id, config: {...config}, mesh, body, collider, rowText: ''}
        refreshRowText(entity)
        entities.push(entity)
        byId.set(id, entity)
        rebuildPanelInfo()
        return entity
    }

    const updateConfig = (id: number, config: SlopeBlockConfig): void => {
        const entity = byId.get(id)
        if (entity === undefined) return
        world.removeCollider(entity.collider, true)
        disposeSlopeBlockMesh(entity.mesh)
        const nextMesh = createSlopeBlockMesh(config)
        nextMesh.position.copy(entity.mesh.position)
        nextMesh.quaternion.copy(entity.mesh.quaternion)
        scene.remove(entity.mesh)
        scene.add(nextMesh)
        entity.mesh = nextMesh
        entity.config = {...config}
        entity.collider = createCollider(entity.body, config)
        refreshRowText(entity)
        rebuildPanelInfo()
    }

    const remove = (id: number): void => {
        const index = entities.findIndex(entity => entity.id === id)
        if (index === -1) return
        const entity = entities[index]
        const wasSelected = selectedId === id
        events.emit('delete', id, wasSelected)
        if (wasSelected) select(undefined)
        scene.remove(entity.mesh)
        disposeSlopeBlockMesh(entity.mesh)
        world.removeRigidBody(entity.body)
        entities.splice(index, 1)
        byId.delete(id)
        rebuildPanelInfo()
    }

    const select = (id: number | undefined): SlopeBlockEntity | undefined => {
        selectedId = id
        events.emit('select', id)
        return id === undefined ? undefined : byId.get(id)
    }

    const setTransform = (id: number, pos: XYZ, rotDeg: XYZ): void => {
        const entity = byId.get(id)
        if (entity === undefined) return
        const euler = new Euler(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180, 'XYZ')
        const quat = new Quaternion().setFromEuler(euler)
        entity.mesh.position.set(pos.x, pos.y, pos.z)
        entity.mesh.quaternion.copy(quat)
        entity.body.setTranslation({x: pos.x, y: pos.y, z: pos.z}, true)
        entity.body.setRotation({x: quat.x, y: quat.y, z: quat.z, w: quat.w}, true)
        refreshRowText(entity)
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add(DEFAULT_SLOPE_BLOCK_CONFIG, x, y, z)
    }

    const ctxWithoutPanel: Omit<SlopeBlockContext, 'panel'> = {
        type: TYPE,
        events,
        panelInfo,
        add,
        getAll: () => entities,
        getById: (id) => byId.get(id),
        updateConfig,
        remove,
        select,
        getSelectedId: () => selectedId,
        getMeshes: () => entities.map(entity => entity.mesh),
        getEntityList: () => entities.map(entity => ({id: entity.id, mesh: entity.mesh})),
        spawnAt,
        syncPositions: () => {},
        setTransform,
        getMaterial: (id) => byId.get(id)?.config.material,
    }

    return {
        ...ctxWithoutPanel,
        panel: createSlopeBlockPanel(ctxWithoutPanel),
    }
}
