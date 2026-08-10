import {type Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../../physics/world.ts'
import {GROUND_Y, DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../../physics/constants.ts'
import {createColliderForBody} from '../../../../physics/rapier_utils.ts'
import type {CommonBoxConfig, CommonBox, CommonEntityContext} from '../types'
import type {EntityPanelInfo} from '../../base/types/entity_info'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../../base/types/event_emitter'
import {createCommonBoxMesh, updateCommonBoxMeshSize, disposeCommonBoxMesh} from '../render'
import {createWireframe, cleanupWireframe} from '../../base/render'
import {findNonOverlappingY} from '../../base/physics'
import {formatRowText, createCommonPanel} from '../ui'

import {DEFAULT_COMMON_CONFIG} from '../validation.ts'
import type {EntityType} from '../../../constants.ts'

const TYPE: EntityType = 'box/common' as const
const BADGE_LABEL = 'C'
const BADGE_COLOR = '#448'

export const setupCommonBoxes = (
    scene: Scene,
    shared: SharedWorld,
): CommonEntityContext => {
    const { world } = shared

    const boxes: CommonBox[] = []
    let nextId = 1
    let selectedId: number | undefined
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()

    const rebuildPanelInfo = () => {
        panelInfo.length = 0
        for (const b of boxes) {
            panelInfo.push({
                id: b.id,
                type: TYPE,
                badgeLabel: BADGE_LABEL,
                badgeColor: BADGE_COLOR,
                rowText: b.rowText,
            })
        }
    }

    const refreshRowText = (box: CommonBox): void => {
        box.rowText = formatRowText(box)
        box.emitter.emit('infoUpdate')
    }

    // ── 增删改查 ──

    const add = (config: CommonBoxConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}): CommonBox => {
        const id = nextId++
        const adjustedY = findNonOverlappingY(boxes, config, x, y, z)
        const hw = config.width / 2
        const hh = config.height / 2
        const hd = config.depth / 2
        const {mesh, edges} = createCommonBoxMesh(config)
        mesh.position.set(x, adjustedY, z)
        scene.add(mesh)

        const isStatic = config.mass === 0
        const bodyDesc = isStatic
            ? RAPIER.RigidBodyDesc.fixed()
            : RAPIER.RigidBodyDesc.dynamic()
        bodyDesc.setTranslation(x, adjustedY, z)
        const body = world.createRigidBody(bodyDesc)

        const colliderDesc = RAPIER.ColliderDesc.cuboid(hw, hh, hd)
            .setFriction(0.5)
            .setCollisionGroups((DEFAULT_COLLISION_GROUP << 16) | (DEFAULT_COLLISION_MASK & 0xFFFF))
        const mainCollider = createColliderForBody(world, colliderDesc, body)

        if (quat) {
            body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, false)
            mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w)
        }
        const emitter = createEmitter<EntityEventMap>()
        const pb: CommonBox = {id, mesh, body, mainCollider, config: {...config}, edges, wireframe: undefined, emitter, rowText: ''}
        refreshRowText(pb)
        emitter.on('infoUpdate', rebuildPanelInfo)
        boxes.push(pb)
        rebuildPanelInfo()
        return pb
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add(DEFAULT_COMMON_CONFIG, x, y, z)
    }

    const remove = (id: number): void => {
        const idx = boxes.findIndex(b => b.id === id)
        if (idx === -1) return
        const pb = boxes[idx]
        const wasSelected = selectedId === id
        sourceEvents.emit('delete', id, wasSelected)
        if (wasSelected) select(undefined)
        cleanupWireframe(pb)
        scene.remove(pb.mesh)
        disposeCommonBoxMesh(pb)
        world.removeRigidBody(pb.body)
        boxes.splice(idx, 1)
        for (const b of boxes) {
            if (b.body.bodyType() === RAPIER.RigidBodyType.Dynamic) b.body.wakeUp()
        }
        rebuildPanelInfo()
    }

    // ── 选中管理 ──

    const select = (id: number | undefined): CommonBox | undefined => {
        if (selectedId !== undefined) {
            const prev = boxes.find(b => b.id === selectedId)
            if (prev) cleanupWireframe(prev)
        }
        selectedId = id
        sourceEvents.emit('select', id)
        if (id !== undefined) {
            const pb = boxes.find(b => b.id === id)
            if (pb) {
                const line = createWireframe(pb.mesh.geometry)
                pb.mesh.add(line)
                pb.wireframe = line
                return pb
            }
        }
        return undefined
    }

    const getSelected = (): CommonBox | undefined => {
        if (selectedId === undefined) return undefined
        return boxes.find(b => b.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    // ── 配置更新 ──

    const updateConfig = (id: number, partial: Partial<CommonBoxConfig>): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb) return
        const old = pb.config
        const cfg: CommonBoxConfig = {...old, ...partial}
        const changedSize = partial.width !== undefined || partial.height !== undefined || partial.depth !== undefined
        const changedMass = partial.mass !== undefined && partial.mass !== old.mass
        if (changedSize) {
            const hh = cfg.height / 2
            updateCommonBoxMeshSize(pb, cfg)
            world.removeCollider(pb.mainCollider, true)
            const colliderDesc = RAPIER.ColliderDesc.cuboid(cfg.width / 2, hh, cfg.depth / 2)
                .setFriction(0.5)
                .setCollisionGroups((DEFAULT_COLLISION_GROUP << 16) | (DEFAULT_COLLISION_MASK & 0xFFFF))
            pb.mainCollider = createColliderForBody(world, colliderDesc, pb.body)
            const pos = pb.body.translation()
            const oldBottom = pos.y - old.height / 2
            const newBottom = pos.y - hh
            if (newBottom < oldBottom || newBottom < GROUND_Y) {
                const target = Math.max(oldBottom, GROUND_Y)
                pb.body.setTranslation({ x: pos.x, y: target + hh, z: pos.z }, true)
                pb.mesh.position.y = target + hh
            }
            if (pb.wireframe) {
                cleanupWireframe(pb)
                pb.wireframe = createWireframe(pb.mesh.geometry)
                pb.mesh.add(pb.wireframe)
            }
        }
        if (changedMass) {
            if (cfg.mass === 0) {
                pb.body.setBodyType(RAPIER.RigidBodyType.Fixed, true)
            } else {
                pb.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
                pb.body.wakeUp()
            }
        }
        pb.config = cfg
        refreshRowText(pb)
    }

    const setTransform = (
        id: number,
        pos: {x: number; y: number; z: number},
        rotDeg: {x: number; y: number; z: number},
    ): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb) return
        pb.mesh.position.set(pos.x, pos.y, pos.z)
        pb.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true)
        pb.mesh.rotation.set(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180)
        pb.body.setRotation(
            { x: pb.mesh.quaternion.x, y: pb.mesh.quaternion.y, z: pb.mesh.quaternion.z, w: pb.mesh.quaternion.w },
            true,
        )
        refreshRowText(pb)
    }

    // ── 同步 ──

    const syncPositions = (): void => {
        for (const pb of boxes) {
            const pos = pb.body.translation()
            pb.mesh.position.set(pos.x, pos.y, pos.z)
            const rot = pb.body.rotation()
            pb.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
            pb.rowText = formatRowText(pb)
        }
        rebuildPanelInfo()
    }

    // ── 上下文 ──

    const ctxWithoutPanel: Omit<CommonEntityContext, 'panel'> = {
        type: TYPE,
        events: sourceEvents,
        panelInfo,
        add,
        spawnAt,
        remove,
        select,
        getSelected,
        getSelectedId,
        getAll: () => boxes,
        getEntityList: () => boxes,
        getMeshes: () => boxes.map(b => b.mesh),
        syncPositions,
        updateConfig,
        setTransform,
    }
    return {
        ...ctxWithoutPanel,
        panel: createCommonPanel(ctxWithoutPanel),
    }
}
