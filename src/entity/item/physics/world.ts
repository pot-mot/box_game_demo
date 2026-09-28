import {BoxGeometry, Mesh, type Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../physics/world.ts'
import {ITEM_COLLISION_GROUP, ITEM_COLLISION_MASK} from '../../../physics/constants.ts'
import {categoryCollisionGroups} from '../../../physics/collision_category.ts'
import {createColliderForBody} from '../../../physics/rapier_utils.ts'
import type {EntityPanelInfo} from '../../box/base/types/entity_info.ts'
import {createEmitter, type SourceEventMap} from '../../box/base/types/event_emitter.ts'
import type {EntityType} from '../../constants.ts'
import {getSurfaceMaterial} from '../../../render/materials/index.ts'
import type {InteractionTarget} from '../../../character/interaction/types.ts'
import {INTERACTION_MAX_DISTANCE} from '../../../character/interaction/types.ts'
import {findItemDef, isKnownItemId} from '../../../inventory/items.ts'
import type {DroppedItemEntity, ItemEntityContext, SavableItemEntry} from '../types.ts'
import {createItemPanel} from '../ui/panel.ts'

const TYPE: EntityType = 'item'
const BADGE_LABEL = 'V'
const BADGE_COLOR = '#e9c46a'
const FLOAT_HEIGHT = 0.35

export const setupItemEntities = (scene: Scene, shared: SharedWorld): ItemEntityContext => {
    const {world} = shared
    const items: DroppedItemEntity[] = []
    const byId = new Map<number, DroppedItemEntity>()
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()
    let nextId = 1
    let selectedId: number | undefined
    let pickupHandler: (defId: string, count: number) => boolean = () => false

    const rebuildPanelInfo = (): void => {
        panelInfo.length = 0
        for (const e of items) {
            panelInfo.push({id: e.id, type: TYPE, badgeLabel: BADGE_LABEL, badgeColor: BADGE_COLOR, rowText: e.rowText})
        }
    }

    const add = (defId: string, count: number, x: number, y: number, z: number): DroppedItemEntity => {
        const id = nextId++
        const def = findItemDef(defId)
        const [w, h, d] = def?.dropSize ?? [0.25, 0.25, 0.25]
        const geometry = new BoxGeometry(w, h, d)
        const mesh = new Mesh(geometry, getSurfaceMaterial(def?.category === 'weapon' ? 'rusty_iron' : 'wood'))
        mesh.position.set(x, y + FLOAT_HEIGHT, z)
        scene.add(mesh)

        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + FLOAT_HEIGHT, z))
        const collider = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
            .setSensor(true)
            .setCollisionGroups(categoryCollisionGroups(ITEM_COLLISION_GROUP, ITEM_COLLISION_MASK, 'item'))
        createColliderForBody(world, collider, body)

        const e: DroppedItemEntity = {
            id,
            defId,
            count,
            mesh,
            body,
            rowText: `#${id} ${def?.name ?? defId} ×${count}`,
        }
        items.push(e)
        byId.set(id, e)
        rebuildPanelInfo()
        return e
    }

    const remove = (id: number): void => {
        const idx = items.findIndex(e => e.id === id)
        if (idx === -1) return
        const e = items[idx]
        const wasSelected = selectedId === id
        sourceEvents.emit('delete', id, wasSelected)
        if (wasSelected) select(undefined)
        scene.remove(e.mesh)
        e.mesh.geometry.dispose()
        world.removeRigidBody(e.body)
        items.splice(idx, 1)
        byId.delete(id)
        rebuildPanelInfo()
    }

    const select = (id: number | undefined): DroppedItemEntity | undefined => {
        selectedId = id
        sourceEvents.emit('select', id)
        return id === undefined ? undefined : byId.get(id)
    }

    const getSelectedId = (): number | undefined => selectedId

    const spawnAt = (x: number, y: number, z: number): void => {
        add('material_stone', 1, x, y, z)
    }

    const setTransform = (id: number, pos: {x: number; y: number; z: number}, _rotDeg: {x: number; y: number; z: number}): void => {
        const e = byId.get(id)
        if (e === undefined) return
        e.mesh.position.set(pos.x, pos.y + FLOAT_HEIGHT, pos.z)
        e.body.setTranslation({x: pos.x, y: pos.y + FLOAT_HEIGHT, z: pos.z}, true)
    }

    const syncPositions = (): void => rebuildPanelInfo()

    const preSync = (dt: number, _time: number): void => {
        for (const e of items) {
            e.mesh.rotation.y += dt * 1.5
            const t = e.body.translation()
            e.mesh.position.set(t.x, t.y + Math.sin(performance.now() * 0.002) * 0.05, t.z)
        }
    }

    const collectInteractionTargets = (actorX: number, actorY: number, actorZ: number, out: InteractionTarget[]): number => {
        let count = 0
        for (const e of items) {
            const t = e.body.translation()
            const dx = t.x - actorX
            const dy = t.y - actorY
            const dz = t.z - actorZ
            const dist = Math.hypot(dx, dz)
            if (dist > INTERACTION_MAX_DISTANCE || Math.abs(dy) > INTERACTION_MAX_DISTANCE) continue
            const def = findItemDef(e.defId)
            out.push({
                key: `item:${e.id}`,
                kind: 'item',
                prompt: `拾取 ${def?.name ?? e.defId}`,
                x: t.x,
                y: t.y,
                z: t.z,
                score: dist,
            })
            count++
        }
        return count
    }

    const activateInteraction = (key: string): boolean => {
        if (!key.startsWith('item:')) return false
        const id = Number(key.slice('item:'.length))
        if (!Number.isFinite(id)) return false
        const e = byId.get(id)
        if (e === undefined) return false
        if (!pickupHandler(e.defId, e.count)) return true /* 背包已满：消费本次交互但不移除实体 */
        remove(id)
        return true
    }

    const getSave = (): SavableItemEntry[] => items.map(e => {
        const t = e.body.translation()
        return {defId: e.defId, count: e.count, position: [t.x, t.y - FLOAT_HEIGHT, t.z], quaternion: [0, 0, 0, 1]}
    })

    const loadSave = (entries: readonly SavableItemEntry[]): void => {
        for (const e of [...items]) remove(e.id)
        for (const entry of entries) {
            if (!isKnownItemId(entry.defId)) continue
            add(entry.defId, entry.count, entry.position[0], entry.position[1], entry.position[2])
        }
    }

    const ctxWithoutPanel: Omit<ItemEntityContext, 'panel'> = {
        type: TYPE,
        events: sourceEvents,
        panelInfo,
        drop: (defId, count, x, y, z) => ({id: add(defId, count, x, y, z).id}),
        getAll: () => items,
        getById: (id: number) => byId.get(id),
        collectInteractionTargets,
        activateInteraction,
        setPickupHandler: (handler) => { pickupHandler = handler },
        getSave,
        loadSave,
        spawnAt,
        remove,
        select,
        getSelectedId,
        getMeshes: () => items.map(e => e.mesh),
        getEntityList: () => items.map(e => ({id: e.id, mesh: e.mesh})),
        syncPositions,
        setTransform,
        preSync,
    }

    return {
        ...ctxWithoutPanel,
        panel: createItemPanel(ctxWithoutPanel),
    }
}
