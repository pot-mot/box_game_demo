import {type Scene, MeshBasicMaterial, LineBasicMaterial} from 'three'
import {Vec3} from 'cannon-es'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../../physics/world.ts'
import {GROUND_Y, DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../../physics/constants.ts'
import {createColliderForBody, quatVmult, setBodyMass} from '../../../../physics/rapier_utils.ts'
import type {VelocitySnapshots} from '../../../../physics/velocity_snapshots.ts'
import type {DestructibleConfig, DestructibleBox, DestructionBoxAddOptions, DestructionEntityContext, CollisionRecord} from '../types'
import type {FragmentEntityContext} from '../../../fragment/common/types'
import type {XYZ} from '../../base/types'
import type {EntityPanelInfo} from '../../base/types/entity_info'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../../base/types/event_emitter'
import {clampHealth, clampHealthOnMaxChange} from '../../base/types/health'
import {DEFAULT_DESTRUCTIBLE_CONFIG} from '../validation.ts'
import {
    IMPACT_FORCE_SCALE,
    COLLISION_COOLDOWN,
    MIN_FRAGMENT_COUNT,
    MAX_COLLISION_HISTORY,
    EJECT_VELOCITY_SCALE,
} from './constants.ts'
import {
    createDestructibleBoxMesh,
    updateDestructibleBoxMeshSize,
} from '../render'
import {createWireframe, cleanupWireframe} from '../../base/render'
import {findNonOverlappingY} from '../../base/physics'
import {computeFractureFromPoints} from '../../../destroyed/geometry/voronoi_fracture.ts'
import {formatRowText, createDestructionPanel} from '../ui'

import type {EntityType} from "../../../constants.ts";

const TYPE: EntityType = 'box/destruction' as const
const BADGE_LABEL = 'D'
const BADGE_COLOR = '#844'

let globalBoxId = 1

export const setupDestructibleBoxes = (
    scene: Scene,
    shared: SharedWorld,
    fragmentCtx: FragmentEntityContext,
    velocitySnapshots: VelocitySnapshots,
): DestructionEntityContext => {
    const { world, eventBus } = shared

    const boxes: DestructibleBox[] = []
    let selectedId: number | undefined
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()

    /**
     * 碰撞事件即时处理（事件发生在刚体结算后的当前子步）：
     * 用「上一子步」的速度快照计算冲击速度，避免读到撞击后的 ≈0 速度。
     * 伤害扣除与碎裂仍延后到 preSync（updatePhysics）统一执行。
     */
    eventBus.subscribe((h1, h2, started) => {
        if (!started) return
        for (const pb of boxes) {
            if (pb.destroyed) continue
            if (pb.mainCollider.handle !== h1 && pb.mainCollider.handle !== h2) continue

            const myHandle = pb.mainCollider.handle
            const otherHandle = myHandle === h1 ? h2 : h1
            const otherCollider = world.getCollider(otherHandle)
            if (!otherCollider) continue
            const otherBody = otherCollider.parent()
            if (!otherBody) continue

            const otherBodyHandle = otherBody.handle
            if ((pb._cooldowns.get(otherBodyHandle) ?? 0) > 0) continue
            pb._cooldowns.set(otherBodyHandle, COLLISION_COOLDOWN)

            world.contactPair(pb.mainCollider, otherCollider, (manifold, flipped) => {
                const n = manifold.normal()
                /* manifold.normal() 指向接触对内部顺序的 collider1 → collider2；
                 * flipped=true 表示内部顺序与查询参数相反，取反后得到
                 * 「从本箱子指向对方」的确定性法线（存入存档，方向必须稳定） */
                const normal = flipped
                    ? [-n.x, -n.y, -n.z] as [number, number, number]
                    : [n.x, n.y, n.z] as [number, number, number]

                const solverPt = manifold.solverContactPoint(0)
                const contactPoint: [number, number, number] = solverPt
                    ? [solverPt.x, solverPt.y, solverPt.z]
                    : [0, 0, 0]

                const ourVel = velocitySnapshots.get(pb.body.handle) ?? pb.body.linvel()
                const otherVel = velocitySnapshots.get(otherBodyHandle) ?? otherBody.linvel()
                const relVel = Math.abs(
                    (ourVel.x - otherVel.x) * normal[0] +
                    (ourVel.y - otherVel.y) * normal[1] +
                    (ourVel.z - otherVel.z) * normal[2],
                )

                const record: CollisionRecord = {
                    contactPoint,
                    normal,
                    relativeVelocity: relVel,
                }

                pb._collisions.push(record)
                pb._collisionHistory.push(record)
                while (pb._collisionHistory.length > MAX_COLLISION_HISTORY) {
                    pb._collisionHistory.shift()
                }
            })
        }
    })

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

    const refreshRowText = (box: DestructibleBox): void => {
        box.rowText = formatRowText(box)
        box.emitter.emit('infoUpdate')
    }

    const add = (config: DestructibleConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, options?: DestructionBoxAddOptions): DestructibleBox => {
        const id = globalBoxId++
        const halfH = config.height / 2
        const py = findNonOverlappingY(boxes, config, x, y, z, (b) => b.destroyed)

        const {mesh, edges} = createDestructibleBoxMesh(config)
        mesh.position.set(x, py, z)
        scene.add(mesh)

        const isStatic = config.mass === 0
        const bodyDesc = isStatic
            ? RAPIER.RigidBodyDesc.fixed()
            : RAPIER.RigidBodyDesc.dynamic()
        bodyDesc.setTranslation(x, py, z)
        const body = world.createRigidBody(bodyDesc)

        const colliderDesc = RAPIER.ColliderDesc.cuboid(config.width / 2, halfH, config.depth / 2)
            .setFriction(0.5)
            /* 密度 0：质量完全由附加质量决定 */
            .setDensity(0)
            .setCollisionGroups((DEFAULT_COLLISION_GROUP << 16) | (DEFAULT_COLLISION_MASK & 0xFFFF))
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

        const _collisions: CollisionRecord[] = options?.collisions ?? []
        const _collisionHistory: CollisionRecord[] = options?.collisionHistory ?? []
        const _cooldowns = options?.cooldowns ?? new Map<number, number>()

        const emitter = createEmitter<EntityEventMap>()
        const pb: DestructibleBox = {
            id, mesh, edges, wireframe: undefined,
            body, mainCollider, config: {...config},
            health: options?.health ?? config.maxHealth,
            maxHealth: config.maxHealth,
            fragments: [],
            destroyed: false,
            _collisions,
            _collisionHistory,
            _cooldowns,
            emitter,
            rowText: '',
        }
        refreshRowText(pb)
        emitter.on('infoUpdate', rebuildPanelInfo)
        boxes.push(pb)
        rebuildPanelInfo()
        return pb
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add(DEFAULT_DESTRUCTIBLE_CONFIG, x, y, z)
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
        pb.mesh.geometry.dispose()
        ;(pb.mesh.material as MeshBasicMaterial).dispose()
        pb.mesh.remove(pb.edges)
        pb.edges.geometry.dispose()
        ;(pb.edges.material as LineBasicMaterial).dispose()

        world.removeRigidBody(pb.body)
        boxes.splice(idx, 1)
        rebuildPanelInfo()
    }

    const select = (id: number | undefined): DestructibleBox | undefined => {
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

    const getSelected = (): DestructibleBox | undefined => {
        if (selectedId === undefined) return undefined
        return boxes.find(b => b.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    const updateConfig = (id: number, partial: Partial<DestructibleConfig>): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb || pb.destroyed) return
        const old = pb.config
        const cfg: DestructibleConfig = {...old, ...partial}
        const changedSize = partial.width !== undefined || partial.height !== undefined || partial.depth !== undefined
        const changedMass = partial.mass !== undefined && partial.mass !== old.mass
        if (changedSize) {
            const hh = cfg.height / 2
            updateDestructibleBoxMeshSize(pb, cfg)
            world.removeCollider(pb.mainCollider, true)
            const colliderDesc = RAPIER.ColliderDesc.cuboid(cfg.width / 2, hh, cfg.depth / 2)
                .setFriction(0.5)
                /* 密度 0：重建碰撞体不改变刚体质量 */
                .setDensity(0)
                .setCollisionGroups((DEFAULT_COLLISION_GROUP << 16) | (DEFAULT_COLLISION_MASK & 0xFFFF))
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

    const setTransform = (id: number, pos: XYZ, rotDeg: XYZ): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb || pb.destroyed) return
        pb.mesh.position.set(pos.x, pos.y, pos.z)
        pb.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true)
        pb.mesh.rotation.set(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180)
        pb.body.setRotation(
            { x: pb.mesh.quaternion.x, y: pb.mesh.quaternion.y, z: pb.mesh.quaternion.z, w: pb.mesh.quaternion.w },
            true,
        )
        if (pb.body.bodyType() === RAPIER.RigidBodyType.Dynamic) pb.body.wakeUp()
        refreshRowText(pb)
    }

    const setHealth = (id: number, health: number): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb || pb.destroyed) return
        clampHealth(pb, health)
        refreshRowText(pb)
    }

    const destroyBox = (pb: DestructibleBox, collisionPoint: [number, number, number], ejectForce: number): void => {
        if (pb.destroyed || pb.fragments.length === 0) return

        pb.destroyed = true
        cleanupWireframe(pb)

        const bodyPos = pb.body.translation()
        const bodyRot = pb.body.rotation()

        world.removeRigidBody(pb.body)
        scene.remove(pb.mesh)
        pb.mesh.geometry.dispose()
        ;(pb.mesh.material as MeshBasicMaterial).dispose()
        pb.mesh.remove(pb.edges)
        pb.edges.geometry.dispose()
        ;(pb.edges.material as LineBasicMaterial).dispose()

        for (let fi = 0; fi < pb.fragments.length; fi++) {
            const frag = pb.fragments[fi]
            if (frag.renderIndices.length < 3) continue

            const label = `#box${pb.id}-${fi}`
            const worldCentroid = {
                x: bodyPos.x + frag.centroid[0],
                y: bodyPos.y + frag.centroid[1],
                z: bodyPos.z + frag.centroid[2],
            }
            const quat = {
                x: bodyRot.x, y: bodyRot.y,
                z: bodyRot.z, w: bodyRot.w,
            }

            const cp = { x: collisionPoint[0], y: collisionPoint[1], z: collisionPoint[2] }
            const dir = {
                x: worldCentroid.x - cp.x,
                y: worldCentroid.y - cp.y,
                z: worldCentroid.z - cp.z,
            }
            const dirLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
            let impulse: {x: number; y: number; z: number} | undefined
            if (dirLen > 0.001) {
                const invLen = 1 / dirLen
                const force = ejectForce * frag.massRatio
                impulse = {x: dir.x * invLen * force, y: dir.y * invLen * force, z: dir.z * invLen * force}
            }

            fragmentCtx.add(frag, label, worldCentroid, quat, impulse)
        }

        boxes.splice(boxes.indexOf(pb), 1)
    }

    const updatePhysics = (dt: number): void => {
        for (let i = boxes.length - 1; i >= 0; i--) {
            const pb = boxes[i]
            if (pb.destroyed) continue
            const cols = pb._collisions
            if (cols.length === 0) continue

            let healthChanged = false

            for (const col of cols) {
                const impact = col.relativeVelocity * pb.config.mass * IMPACT_FORCE_SCALE
                pb.health -= impact
                healthChanged = true
            }

            if (healthChanged) {
                refreshRowText(pb)
            }

            if (pb.health <= 0 && !pb.destroyed) {
                const wasSelected = selectedId === pb.id
                const lastCol = cols[cols.length - 1]
                const history = pb._collisionHistory

                const bodyPos = pb.body.translation()
                const bodyRot = pb.body.rotation()
                const invRot = { x: -bodyRot.x, y: -bodyRot.y, z: -bodyRot.z, w: bodyRot.w }
                const localSeeds: Vec3[] = []
                for (const h of history) {
                    const offset = {
                        x: h.contactPoint[0] - bodyPos.x,
                        y: h.contactPoint[1] - bodyPos.y,
                        z: h.contactPoint[2] - bodyPos.z,
                    }
                    const local = { x: 0, y: 0, z: 0 }
                    quatVmult(local, invRot, offset)
                    localSeeds.push(new Vec3(local.x, local.y, local.z))
                }

                pb.fragments = computeFractureFromPoints(
                    [pb.config.width, pb.config.height, pb.config.depth],
                    localSeeds,
                    MIN_FRAGMENT_COUNT,
                )

                const avgSpeed = history.length > 0
                    ? history.reduce((s, c) => s + c.relativeVelocity, 0) / history.length
                    : 5
                const dynamicEjectForce = avgSpeed * EJECT_VELOCITY_SCALE

                destroyBox(pb, lastCol ? lastCol.contactPoint : [0, 0, 0], dynamicEjectForce)
                if (wasSelected) sourceEvents.emit('delete', pb.id, true)
                rebuildPanelInfo()
            }
            cols.length = 0
        }

        for (const pb of boxes) {
            const cooldowns = pb._cooldowns
            for (const [key, val] of cooldowns) {
                const next = val - dt
                if (next <= 0) cooldowns.delete(key)
                else cooldowns.set(key, next)
            }
        }
    }

    const syncPositions = (): void => {
        for (const pb of boxes) {
            if (pb.destroyed) continue
            const pos = pb.body.translation()
            pb.mesh.position.set(pos.x, pos.y, pos.z)
            const rot = pb.body.rotation()
            pb.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
            pb.rowText = formatRowText(pb)
        }
        rebuildPanelInfo()
    }

    const ctxWithoutPanel: Omit<DestructionEntityContext, 'panel'> = {
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
        updateConfig,
        setTransform,
        setHealth,
        updatePhysics,
        preSync: updatePhysics,
        syncPositions,
    }
    return {
        ...ctxWithoutPanel,
        panel: createDestructionPanel(ctxWithoutPanel),
    }
}
