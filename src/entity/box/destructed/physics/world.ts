import {type Scene, MeshBasicMaterial, LineBasicMaterial} from 'three'
import {Body, BODY_TYPES, Box, Vec3} from 'cannon-es'
import type {SharedWorld} from '../../../../physics/world.ts'
import {GROUND_Y, DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../../physics/constants.ts'
import type {DestructibleConfig, DestructibleBox, DestructionEntityContext, CollisionRecord} from '../types'
import type {FragmentEntityContext} from '../../../fragment/common/types'
import type {XYZ} from '../../base/types'
import type {EntityPanelInfo} from '../../base/types/entity_info'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../../base/types/event_emitter'
import {clampHealth, clampHealthOnMaxChange} from '../../base/types/health'
import {
    DEFAULT_DESTRUCTIBLE_CONFIG,
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
import type {PanelContext} from '../../base/ui'
import type {EntityType} from "../../../constants.ts";

const TYPE: EntityType = 'box/destruction' as const
const BADGE_LABEL = 'D'
const BADGE_COLOR = '#844'

let globalBoxId = 1

export const setupDestructibleBoxes = (scene: Scene, shared: SharedWorld, fragmentCtx: FragmentEntityContext): DestructionEntityContext => {
    const {world, boxMat} = shared

    const boxes: DestructibleBox[] = []
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

    const refreshRowText = (box: DestructibleBox): void => {
        box.rowText = formatRowText(box)
        box.emitter.emit('infoUpdate')
    }

    const add = (config: DestructibleConfig, x: number, y: number, z: number): DestructibleBox => {
        const id = globalBoxId++
        const halfH = config.height / 2
        const py = findNonOverlappingY(boxes, config, x, y, z, (b) => b.destroyed)

        const {mesh, edges} = createDestructibleBoxMesh(config)
        mesh.position.set(x, py, z)
        scene.add(mesh)

        const body = new Body({
            mass: config.mass,
            type: config.mass === 0 ? BODY_TYPES.STATIC : BODY_TYPES.DYNAMIC,
            material: boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        body.addShape(new Box(new Vec3(config.width / 2, halfH, config.depth / 2)))
        body.position.set(x, py, z)
        world.addBody(body)

        const _collisions: CollisionRecord[] = []
        const _collisionHistory: CollisionRecord[] = []
        const _cooldowns = new Map<number, number>()

        const onCollide = (e: any): void => {
            const contact = e.contact
            const isBi = contact.bi === body
            const otherBody = isBi ? contact.bj : contact.bi

            const otherId = otherBody.id
            if ((_cooldowns.get(otherId) || 0) > 0) return
            _cooldowns.set(otherId, COLLISION_COOLDOWN)

            const normal = isBi ? contact.ni.clone() : contact.ni.clone().negate()

            const point = new Vec3()
            if (isBi) {
                point.x = contact.bi.position.x + contact.ri.x
                point.y = contact.bi.position.y + contact.ri.y
                point.z = contact.bi.position.z + contact.ri.z
            } else {
                point.x = contact.bj.position.x + contact.rj.x
                point.y = contact.bj.position.y + contact.rj.y
                point.z = contact.bj.position.z + contact.rj.z
            }

            const vd = new Vec3()
            if (isBi) {
                vd.x = contact.bi.velocity.x - contact.bj.velocity.x
                vd.y = contact.bi.velocity.y - contact.bj.velocity.y
                vd.z = contact.bi.velocity.z - contact.bj.velocity.z
            } else {
                vd.x = contact.bj.velocity.x - contact.bi.velocity.x
                vd.y = contact.bj.velocity.y - contact.bi.velocity.y
                vd.z = contact.bj.velocity.z - contact.bi.velocity.z
            }
            const relVel = Math.abs(vd.x * normal.x + vd.y * normal.y + vd.z * normal.z)

            const record: CollisionRecord = {
                contactPoint: [point.x, point.y, point.z],
                normal: [normal.x, normal.y, normal.z],
                relativeVelocity: relVel,
            }

            _collisions.push(record)
            _collisionHistory.push(record)
            while (_collisionHistory.length > MAX_COLLISION_HISTORY) {
                _collisionHistory.shift()
            }
        }

        body.addEventListener('collide', onCollide)

        const emitter = createEmitter<EntityEventMap>()
        const pb: DestructibleBox = {
            id, mesh, edges, wireframe: undefined,
            body, config: {...config},
            health: config.maxHealth,
            maxHealth: config.maxHealth,
            fragments: [],
            destroyed: false,
            _collisions,
            _collisionHistory,
            _cooldowns,
            _onCollide: onCollide,
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
        if (pb._onCollide) pb.body.removeEventListener('collide', pb._onCollide)
        scene.remove(pb.mesh)
        pb.mesh.geometry.dispose()
        ;(pb.mesh.material as MeshBasicMaterial).dispose()
        pb.mesh.remove(pb.edges)
        pb.edges.geometry.dispose()
        ;(pb.edges.material as LineBasicMaterial).dispose()

        world.removeBody(pb.body)
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
            while (pb.body.shapes.length) pb.body.removeShape(pb.body.shapes[0])
            pb.body.addShape(new Box(new Vec3(cfg.width / 2, hh, cfg.depth / 2)))
            pb.body.updateMassProperties()
            const oldBottom = pb.body.position.y - old.height / 2
            const newBottom = pb.body.position.y - hh
            if (newBottom < oldBottom || newBottom < GROUND_Y) {
                const target = Math.max(oldBottom, GROUND_Y)
                pb.body.position.y = target + hh
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
                pb.body.type = BODY_TYPES.STATIC
                pb.body.mass = 0
            } else {
                pb.body.type = BODY_TYPES.DYNAMIC
                pb.body.mass = cfg.mass
                pb.body.updateMassProperties()
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
        pb.body.position.set(pos.x, pos.y, pos.z)
        pb.mesh.rotation.set(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180)
        pb.body.quaternion.set(pb.mesh.quaternion.x, pb.mesh.quaternion.y, pb.mesh.quaternion.z, pb.mesh.quaternion.w)
        if (pb.body.type === BODY_TYPES.DYNAMIC) pb.body.wakeUp()
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
        world.removeBody(pb.body)
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
                x: pb.body.position.x + frag.centroid[0],
                y: pb.body.position.y + frag.centroid[1],
                z: pb.body.position.z + frag.centroid[2],
            }
            const quat = {
                x: pb.body.quaternion.x, y: pb.body.quaternion.y,
                z: pb.body.quaternion.z, w: pb.body.quaternion.w,
            }

            const cp = new Vec3(collisionPoint[0], collisionPoint[1], collisionPoint[2])
            const dir = new Vec3(
                worldCentroid.x - cp.x,
                worldCentroid.y - cp.y,
                worldCentroid.z - cp.z,
            )
            const dirLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
            let impulse: {x: number; y: number; z: number} | undefined
            if (dirLen > 0.001) {
                dir.x /= dirLen; dir.y /= dirLen; dir.z /= dirLen
                const force = ejectForce * frag.massRatio
                impulse = {x: dir.x * force, y: dir.y * force, z: dir.z * force}
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

                const invQuat = pb.body.quaternion.clone().inverse()
                const localSeeds: Vec3[] = []
                for (const h of history) {
                    const offset = new Vec3(
                        h.contactPoint[0] - pb.body.position.x,
                        h.contactPoint[1] - pb.body.position.y,
                        h.contactPoint[2] - pb.body.position.z,
                    )
                    localSeeds.push(invQuat.vmult(offset))
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
            pb.mesh.position.set(pb.body.position.x, pb.body.position.y, pb.body.position.z)
            pb.mesh.quaternion.set(pb.body.quaternion.x, pb.body.quaternion.y, pb.body.quaternion.z, pb.body.quaternion.w)
            pb.rowText = formatRowText(pb)
        }
        rebuildPanelInfo()
    }

    const ctx: DestructionEntityContext = {
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
        syncPositions,
        panel: undefined as unknown as PanelContext,
    }
    ctx.panel = createDestructionPanel(ctx)
    return ctx
}
