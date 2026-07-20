import {type Scene, MeshBasicMaterial, LineBasicMaterial} from 'three'
import {Body, BODY_TYPES, ConvexPolyhedron, Vec3} from 'cannon-es'
import type {SharedWorld} from '../../../../physics/world.ts'
import {DEBRIS_COLLISION_GROUP, DEBRIS_COLLISION_MASK} from '../../../../physics/constants.ts'
import type {FragmentConfig, Fragment, FragmentEntityContext} from '../types'
import type {FragmentData} from '../../../destroyed/types'
import type {XYZ} from '../../../box/base/types'
import type {EntityPanelInfo} from '../../../box/base/types/entity_info'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../../../box/base/types/event_emitter'
import {createFragmentFromData, syncFragmentToMesh} from '../render'
import {createWireframe, cleanupWireframe} from '../../../box/base/render'
import {formatRowText, createFragmentPanel} from '../ui'
import type {PanelContext} from '../../../box/base/ui'
import type {EntityType} from '../../../constants'
import {DEFAULT_FRAGMENT_CONFIG} from './constants.ts'

const TYPE: EntityType = 'fragment/common' as const
const BADGE_LABEL = 'F'
const BADGE_COLOR = '#666'

export const setupFragmentEntities = (scene: Scene, shared: SharedWorld): FragmentEntityContext => {
    const {world, boxMat} = shared

    const fragments: Fragment[] = []
    let nextId = 1
    let selectedId: number | undefined
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()

    const rebuildPanelInfo = () => {
        panelInfo.length = 0
        for (const f of fragments) {
            panelInfo.push({
                id: f.id,
                type: TYPE,
                badgeLabel: BADGE_LABEL,
                badgeColor: BADGE_COLOR,
                rowText: f.rowText,
            })
        }
    }

    const refreshRowText = (f: Fragment): void => {
        f.rowText = formatRowText(f)
        f.emitter.emit('infoUpdate')
    }

    const add = (
        data: FragmentData,
        label: string,
        pos: {x: number; y: number; z: number},
        quat: {x: number; y: number; z: number; w: number},
        impulse?: {x: number; y: number; z: number},
    ): Fragment => {
        const id = nextId++
        const cfg: FragmentConfig = {...DEFAULT_FRAGMENT_CONFIG}

        const {mesh, edges} = createFragmentFromData(data)
        scene.add(mesh)

        const body = new Body({
            mass: Math.max(cfg.mass, 0.01),
            type: BODY_TYPES.DYNAMIC,
            material: boxMat,
            collisionFilterGroup: DEBRIS_COLLISION_GROUP,
            collisionFilterMask: DEBRIS_COLLISION_MASK,
        })

        const hull = new ConvexPolyhedron({
            vertices: data.hullVertices,
            faces: data.hullFaces,
        })
        body.addShape(hull)

        const worldCentroid = new Vec3(pos.x + data.centroid[0], pos.y + data.centroid[1], pos.z + data.centroid[2])
        body.position.copy(worldCentroid)
        body.quaternion.set(quat.x, quat.y, quat.z, quat.w)
        mesh.position.set(body.position.x, body.position.y, body.position.z)
        mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)

        if (impulse) {
            const imp = new Vec3(impulse.x, impulse.y, impulse.z)
            body.applyImpulse(imp, worldCentroid)
        }

        world.addBody(body)

        const emitter = createEmitter<EntityEventMap>()
        const fragment: Fragment = {
            id, config: cfg, mesh, body, edges, wireframe: undefined,
            label, emitter, rowText: '',
        }
        refreshRowText(fragment)
        emitter.on('infoUpdate', rebuildPanelInfo)
        fragments.push(fragment)
        rebuildPanelInfo()
        return fragment
    }

    const remove = (id: number): void => {
        const idx = fragments.findIndex(f => f.id === id)
        if (idx === -1) return
        const f = fragments[idx]
        const wasSelected = selectedId === id
        sourceEvents.emit('delete', id, wasSelected)
        if (wasSelected) select(undefined)
        cleanupWireframe(f)
        scene.remove(f.mesh)
        f.mesh.geometry.dispose()
        ;(f.mesh.material as MeshBasicMaterial).dispose()
        f.mesh.remove(f.edges)
        f.edges.geometry.dispose()
        ;(f.edges.material as LineBasicMaterial).dispose()
        world.removeBody(f.body)
        fragments.splice(idx, 1)
        rebuildPanelInfo()
    }

    const select = (id: number | undefined): Fragment | undefined => {
        if (selectedId !== undefined) {
            const prev = fragments.find(f => f.id === selectedId)
            if (prev) cleanupWireframe(prev)
        }
        selectedId = id
        sourceEvents.emit('select', id)
        if (id !== undefined) {
            const f = fragments.find(f => f.id === id)
            if (f) {
                const line = createWireframe(f.mesh.geometry)
                f.mesh.add(line)
                f.wireframe = line
                return f
            }
        }
        return undefined
    }

    const getSelected = (): Fragment | undefined => {
        if (selectedId === undefined) return undefined
        return fragments.find(f => f.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    const updateConfig = (id: number, partial: Partial<FragmentConfig>): void => {
        const f = fragments.find(f => f.id === id)
        if (!f) return
        const old = f.config
        const cfg: FragmentConfig = {...old, ...partial}
        const changedMass = partial.mass !== undefined && partial.mass !== old.mass
        if (changedMass) {
            if (cfg.mass === 0) {
                f.body.type = BODY_TYPES.STATIC
                f.body.mass = 0
            } else {
                f.body.type = BODY_TYPES.DYNAMIC
                f.body.mass = cfg.mass
                f.body.updateMassProperties()
                f.body.wakeUp()
            }
        }
        f.config = cfg
        refreshRowText(f)
    }

    const setTransform = (id: number, pos: XYZ, rotDeg: XYZ): void => {
        const f = fragments.find(f => f.id === id)
        if (!f) return
        f.mesh.position.set(pos.x, pos.y, pos.z)
        f.body.position.set(pos.x, pos.y, pos.z)
        f.mesh.rotation.set(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180)
        f.body.quaternion.set(f.mesh.quaternion.x, f.mesh.quaternion.y, f.mesh.quaternion.z, f.mesh.quaternion.w)
        if (f.body.type === BODY_TYPES.DYNAMIC) f.body.wakeUp()
        refreshRowText(f)
    }

    const updatePhysics = (dt: number): void => {
        for (let i = fragments.length - 1; i >= 0; i--) {
            const f = fragments[i]
            f.config.lifetime -= dt
            if (f.config.lifetime <= 0) {
                const wasSelected = selectedId === f.id
                sourceEvents.emit('delete', f.id, wasSelected)
                if (wasSelected) select(undefined)
                cleanupWireframe(f)
                scene.remove(f.mesh)
                f.mesh.geometry.dispose()
                ;(f.mesh.material as MeshBasicMaterial).dispose()
                f.mesh.remove(f.edges)
                f.edges.geometry.dispose()
                ;(f.edges.material as LineBasicMaterial).dispose()
                world.removeBody(f.body)
                fragments.splice(i, 1)
            }
        }
    }

    const syncPositions = (): void => {
        for (const f of fragments) {
            syncFragmentToMesh(f)
            f.rowText = formatRowText(f)
        }
        rebuildPanelInfo()
    }

    const ctx: FragmentEntityContext = {
        type: TYPE,
        events: sourceEvents,
        panelInfo,
        add,
        spawnAt: (_x: number, _y: number, _z: number) => {},
        remove,
        select,
        getSelected,
        getSelectedId,
        getAll: () => fragments,
        getEntityList: () => fragments,
        getMeshes: () => fragments.map(f => f.mesh),
        syncPositions,
        updateConfig,
        setTransform,
        updatePhysics,
        preSync: updatePhysics,
        panel: undefined as unknown as PanelContext,
    }
    ctx.panel = createFragmentPanel(ctx)
    return ctx
}
