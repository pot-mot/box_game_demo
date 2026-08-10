import {type Scene, MeshBasicMaterial, LineBasicMaterial} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createColliderForBody} from '../../../../physics/rapier_utils.ts'
import type {SharedWorld} from '../../../../physics/world.ts'
import {FRAGMENT_COLLISION_GROUP, FRAGMENT_COLLISION_MASK} from '../../../../physics/constants.ts'
import type {FragmentConfig, Fragment, FragmentEntityContext} from '../types'
import type {FragmentData} from '../../../destroyed/types'
import type {XYZ} from '../../../box/base/types'
import type {EntityPanelInfo} from '../../../box/base/types/entity_info'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../../../box/base/types/event_emitter'
import {createFragmentFromData, syncFragmentToMesh} from '../render'
import {createWireframe, cleanupWireframe} from '../../../box/base/render'
import {formatRowText, createFragmentPanel} from '../ui'

import type {EntityType} from '../../../constants'
import {DEFAULT_FRAGMENT_CONFIG} from '../validation.ts'

const TYPE: EntityType = 'fragment/common' as const
const BADGE_LABEL = 'F'
const BADGE_COLOR = '#666'

export const setupFragmentEntities = (scene: Scene, shared: SharedWorld): FragmentEntityContext => {
    const {world} = shared

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

        const flatVerts = new Float32Array(data.hullVertices.length * 3)
        for (let i = 0; i < data.hullVertices.length; i++) {
            flatVerts[i * 3] = data.hullVertices[i].x
            flatVerts[i * 3 + 1] = data.hullVertices[i].y
            flatVerts[i * 3 + 2] = data.hullVertices[i].z
        }

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(
                pos.x + data.centroid[0],
                pos.y + data.centroid[1],
                pos.z + data.centroid[2],
            )
            .setRotation(quat)
            .setCanSleep(true)
        bodyDesc.setAdditionalMass(Math.max(cfg.mass, 0.01))
        const body = world.createRigidBody(bodyDesc)

        const colliderDesc = RAPIER.ColliderDesc.convexHull(flatVerts)!
        const mainCollider = createColliderForBody(world, colliderDesc
            .setFriction(0.5)
            .setCollisionGroups((FRAGMENT_COLLISION_GROUP << 16) | (FRAGMENT_COLLISION_MASK & 0xFFFF)), body)

        mesh.position.set(body.translation().x, body.translation().y, body.translation().z)
        const rot = body.rotation()
        mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)

        if (impulse) {
            body.applyImpulseAtPoint(
                {x: impulse.x, y: impulse.y, z: impulse.z},
                {
                    x: pos.x + data.centroid[0],
                    y: pos.y + data.centroid[1],
                    z: pos.z + data.centroid[2],
                },
                true,
            )
        }

        const emitter = createEmitter<EntityEventMap>()
        const fragment: Fragment = {
            id, config: cfg, mesh, body, mainCollider, edges, wireframe: undefined,
            label, fragmentData: data, emitter, rowText: '',
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
        world.removeRigidBody(f.body)
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
                f.body.setBodyType(RAPIER.RigidBodyType.Fixed, true)
            } else {
                f.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
                f.body.setAdditionalMass(cfg.mass, true)
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
        f.body.setTranslation({x: pos.x, y: pos.y, z: pos.z}, true)
        f.mesh.rotation.set(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180)
        f.body.setRotation(
            {x: f.mesh.quaternion.x, y: f.mesh.quaternion.y, z: f.mesh.quaternion.z, w: f.mesh.quaternion.w},
            true,
        )
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
                world.removeRigidBody(f.body)
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

    const ctxWithoutPanel: Omit<FragmentEntityContext, 'panel'> = {
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
    }
    return {
        ...ctxWithoutPanel,
        panel: createFragmentPanel(ctxWithoutPanel),
    }
}
