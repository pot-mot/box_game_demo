import {type Scene, ShaderMaterial} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../../physics/world.ts'
import {DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, GROUND_Y} from '../../../../physics/constants.ts'
import {categoryCollisionGroups} from '../../../../physics/collision_category.ts'
import {createColliderForBody, setBodyMass} from '../../../../physics/rapier_utils.ts'
import type {BurningBoxConfig, BurningBox, BurningBoxAddOptions, BurningEntityContext} from '../types'
import type {EntityPanelInfo} from '../../base/types/entity_info'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../../base/types/event_emitter'
import {clampHealth, clampHealthOnMaxChange} from '../../base/types/health'
import {
    createBurningBoxMesh,
    createParticleData,
    createParticlePoints,
    disposeBurningBoxMesh,
    disposeParticlePoints,
    updateBurningBoxMeshSize,
    updateParticles,
} from '../render'
import {cleanupWireframe, createWireframe} from '../../base/render'
import {findNonOverlappingY} from '../../base/physics'
import {createBurningPanel, formatRowText} from '../ui'

import {DEFAULT_BURNING_CONFIG} from '../validation.ts'
import type {EntityType} from '../../../constants.ts'

const TYPE: EntityType = 'box/burning' as const
const BADGE_LABEL = 'B'
const BADGE_COLOR = '#f44'

export const setupBurningBoxes = (
    scene: Scene,
    shared: SharedWorld,
): BurningEntityContext => {
    const { world } = shared

    const boxes: BurningBox[] = []
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

    const refreshRowText = (box: BurningBox): void => {
        box.rowText = formatRowText(box)
        box.emitter.emit('infoUpdate')
    }

    const add = (config: BurningBoxConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, options?: BurningBoxAddOptions): BurningBox => {
        const id = nextId++
        const adjustedY = findNonOverlappingY(boxes, config, x, y, z)
        const hw = config.width / 2
        const hh = config.height / 2
        const hd = config.depth / 2

        const {mesh, edges} = createBurningBoxMesh(config)
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
            /* 密度 0：质量完全由附加质量决定 */
            .setDensity(0)
            .setCollisionGroups(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'box'))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        const mainCollider = createColliderForBody(world, colliderDesc, body)
        if (!isStatic) {
            /* 质量 = config.mass（对齐 cannon-es master）：不设置则按密度 1 × 体积计算 */
            setBodyMass(body, config.mass)
        }

        if (quat) {
            body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, false)
            mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w)
        }

        const particleData = createParticleData()
        const particles = createParticlePoints()
        particles.position.set(x, adjustedY, z)
        scene.add(particles)

        const emitter = createEmitter<EntityEventMap>()
        const pb: BurningBox = {
            id, mesh, body, mainCollider, edges, wireframe: undefined,
            config: {...config},
            health: options?.health ?? config.maxHealth,
            maxHealth: config.maxHealth,
            burnProgress: 0,
            particles, particleData, emitter, rowText: '',
        }
        refreshRowText(pb)
        emitter.on('infoUpdate', rebuildPanelInfo)
        boxes.push(pb)
        rebuildPanelInfo()
        return pb
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add(DEFAULT_BURNING_CONFIG, x, y, z)
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
        disposeBurningBoxMesh(pb)
        scene.remove(pb.particles)
        disposeParticlePoints(pb.particles)
        world.removeRigidBody(pb.body)
        boxes.splice(idx, 1)
        rebuildPanelInfo()
    }

    const select = (id: number | undefined): BurningBox | undefined => {
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

    const getSelected = (): BurningBox | undefined => {
        if (selectedId === undefined) return undefined
        return boxes.find(b => b.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    const updateConfig = (id: number, partial: Partial<BurningBoxConfig>): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb) return
        const old = pb.config
        const cfg: BurningBoxConfig = {...old, ...partial}
        const changedSize = partial.width !== undefined || partial.height !== undefined || partial.depth !== undefined
        const changedMass = partial.mass !== undefined && partial.mass !== old.mass
        if (changedSize) {
            const hh = cfg.height / 2
            updateBurningBoxMeshSize(pb, cfg)
            world.removeCollider(pb.mainCollider, true)
            const colliderDesc = RAPIER.ColliderDesc.cuboid(cfg.width / 2, hh, cfg.depth / 2)
                .setFriction(0.5)
                /* 密度 0：重建碰撞体不改变刚体质量 */
                .setDensity(0)
                .setCollisionGroups(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'box'))
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
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
                /* 同步真实质量（Rapier 的 setBodyType 不携带质量） */
                setBodyMass(pb.body, cfg.mass)
                pb.body.wakeUp()
            }
        }
        pb.config = cfg
        if (partial.maxHealth !== undefined) {
            clampHealthOnMaxChange(pb, cfg.maxHealth)
        }
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
        pb.particles.position.set(pos.x, pos.y, pos.z)
        if (pb.body.bodyType() === RAPIER.RigidBodyType.Dynamic) pb.body.wakeUp()
        refreshRowText(pb)
    }

    const setHealth = (id: number, health: number): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb) return
        clampHealth(pb, health)
        refreshRowText(pb)
    }

    const updatePhysics = (dt: number): void => {
        for (let i = boxes.length - 1; i >= 0; i--) {
            const pb = boxes[i]

            clampHealth(pb, pb.health - dt)
            pb.burnProgress = 1 - pb.health / pb.config.maxHealth

            const mat = pb.mesh.material as ShaderMaterial
            mat.uniforms.uBurnProgress.value = pb.burnProgress
            mat.uniforms.uTime.value += dt

            if (pb.body.bodyType() === RAPIER.RigidBodyType.Dynamic) {
                /* 质量随燃烧递减（对齐 cannon-es master：mass = config.mass × (1 - burn × 0.8)）。
                 * 直接改真实质量，替代迁移期的反力 hack */
                const massScale = 1.0 - pb.burnProgress * 0.8
                setBodyMass(pb.body, pb.config.mass * massScale)
            }

            updateParticles(
                pb.particleData, pb.particles, dt, pb.config, pb.burnProgress,
            )

            refreshRowText(pb)

            if (pb.health <= 0) {
                const wasSelected = selectedId === pb.id
                sourceEvents.emit('delete', pb.id, wasSelected)
                if (wasSelected) select(undefined)
                cleanupWireframe(pb)
                scene.remove(pb.mesh)
                disposeBurningBoxMesh(pb)
                scene.remove(pb.particles)
                disposeParticlePoints(pb.particles)
                world.removeRigidBody(pb.body)
                boxes.splice(i, 1)
                rebuildPanelInfo()
            }
        }
        rebuildPanelInfo()
    }

    const syncPositions = (): void => {
        for (const pb of boxes) {
            const pos = pb.body.translation()
            pb.mesh.position.set(pos.x, pos.y, pos.z)
            const rot = pb.body.rotation()
            pb.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
            pb.particles.position.set(pos.x, pos.y, pos.z)
            pb.rowText = formatRowText(pb)
        }
        rebuildPanelInfo()
    }

    const ctxWithoutPanel: Omit<BurningEntityContext, 'panel'> = {
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
        setHealth,
        updatePhysics,
        preSync: updatePhysics,
    }
    return {
        ...ctxWithoutPanel,
        panel: createBurningPanel(ctxWithoutPanel),
    }
}
