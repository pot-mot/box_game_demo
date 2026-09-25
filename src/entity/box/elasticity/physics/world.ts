import {type Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../../physics/world.ts'
import {GROUND_Y, DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../../physics/constants.ts'
import {categoryCollisionGroups} from '../../../../physics/collision_category.ts'
import {createColliderForBody, quatVmult, setBodyMass} from '../../../../physics/rapier_utils.ts'
import type {VelocitySnapshots} from '../../../../physics/velocity_snapshots.ts'
import type {ElasticBoxConfig, ElasticBox, ElasticBoxAddOptions, ElasticEntityContext} from '../types'
import type {EntityPanelInfo} from '../../base/types/entity_info'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../../base/types/event_emitter'
import {createElasticBoxMesh, updateElasticBoxMeshSize, disposeElasticBoxMesh} from '../render'
import {createWireframe, cleanupWireframe} from '../../base/render'
import {findNonOverlappingY} from '../../base/physics'
import {formatRowText, createElasticPanel} from '../ui'

import {DEFAULT_ELASTIC_CONFIG} from '../validation.ts'
import {
    COLLISION_COOLDOWN,
    IMPACT_DEFORM_SCALE,
    GRAVITY_SQUASH,
} from './constants.ts'
import type {EntityType} from '../../../constants.ts'

// ── 常量 ──

const TYPE: EntityType = 'box/elasticity' as const
const BADGE_LABEL = 'E'
const BADGE_COLOR = '#6b8'

// ── 初始化 ──

export const setupElasticBoxes = (
    scene: Scene,
    shared: SharedWorld,
    velocitySnapshots: VelocitySnapshots,
): ElasticEntityContext => {
    const { world, eventBus } = shared

    const boxes: ElasticBox[] = []
    let nextId = 1
    let selectedId: number | undefined
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()

    /** 碰撞事件即时处理：用撞击前速度计算形变冲量（弹簧积分仍留在 preSync） */
    eventBus.subscribe((h1, h2, started) => {
        if (!started) return

        for (const pb of boxes) {
            if (pb.config.mass === 0) continue
            if (pb.mainCollider.handle !== h1 && pb.mainCollider.handle !== h2) continue

            const myHandle = pb.mainCollider.handle
            const otherHandle = myHandle === h1 ? h2 : h1
            const otherCollider = world.getCollider(otherHandle)
            if (!otherCollider) continue
            const otherBody = otherCollider.parent()
            if (!otherBody) continue

            const otherBodyHandle = otherBody.handle
            if ((pb.cooldowns.get(otherBodyHandle) ?? 0) > 0) continue
            pb.cooldowns.set(otherBodyHandle, COLLISION_COOLDOWN)

            world.contactPair(pb.mainCollider, otherCollider, (manifold, flipped) => {
                const n = manifold.normal()
                /* manifold.normal() 指向接触对内部顺序的 collider1 → collider2；
                 * flipped=true 表示内部顺序与查询参数相反，取反后得到
                 * 「从本箱子指向对方」的确定性法线 */
                const normal = flipped
                    ? { x: -n.x, y: -n.y, z: -n.z }
                    : { x: n.x, y: n.y, z: n.z }

                const ourVel = velocitySnapshots.get(pb.body.handle) ?? pb.body.linvel()
                const otherVel = velocitySnapshots.get(otherBodyHandle) ?? otherBody.linvel()
                const relVel = Math.abs(
                    (ourVel.x - otherVel.x) * normal.x +
                    (ourVel.y - otherVel.y) * normal.y +
                    (ourVel.z - otherVel.z) * normal.z,
                )
                const impulse = relVel * IMPACT_DEFORM_SCALE

                const rot = pb.body.rotation()
                const invRot = { x: -rot.x, y: -rot.y, z: -rot.z, w: rot.w }
                const localN = { x: 0, y: 0, z: 0 }
                quatVmult(localN, invRot, normal)
                const absN = [Math.abs(localN.x), Math.abs(localN.y), Math.abs(localN.z)]
                const axis = absN.indexOf(Math.max(...absN))

                pb.vel[axis] -= impulse
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

    const refreshRowText = (box: ElasticBox): void => {
        box.rowText = formatRowText(box)
        box.emitter.emit('infoUpdate')
    }

    // ── 工具：形变钳制 ──

    const clamp = (v: number, min: number, max: number): number =>
        v < min ? min : v > max ? max : v

    // ── 体积守恒 ──

    const conserveVolume = (pb: ElasticBox): void => {
        const b = [pb.config.width, pb.config.height, pb.config.depth]
        const volume0 = b[0] * b[1] * b[2]
        const vx = Math.max(0.001, b[0] + pb.def[0])
        const vy = Math.max(0.001, b[1] + pb.def[1])
        const vz = Math.max(0.001, b[2] + pb.def[2])
        const volumeA = vx * vy * vz
        if (volumeA < 0.0001) return
        const scale = Math.cbrt(volume0 / volumeA)
        pb.def[0] = vx * scale - b[0]
        pb.def[1] = vy * scale - b[1]
        pb.def[2] = vz * scale - b[2]
    }

    // ── 减缩 ──

    const add = (config: ElasticBoxConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, options?: ElasticBoxAddOptions): ElasticBox => {
        const id = nextId++
        const adjustedY = findNonOverlappingY(boxes, config, x, y, z)
        const hw = config.width / 2
        const hh = config.height / 2
        const hd = config.depth / 2

        const {mesh, edges} = createElasticBoxMesh(config)
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

        const def: [number, number, number] = options?.def ?? [0, -config.height * GRAVITY_SQUASH, 0]
        const vel: [number, number, number] = options?.vel ?? [0, 0, 0]

        const cooldowns = new Map<number, number>()

        const emitter = createEmitter<EntityEventMap>()
        const pb: ElasticBox = {
            id, mesh, body, mainCollider, edges, wireframe: undefined,
            config: {...config},
            def, vel, cooldowns, emitter, rowText: '',
        }
        refreshRowText(pb)
        emitter.on('infoUpdate', rebuildPanelInfo)
        boxes.push(pb)
        rebuildPanelInfo()
        return pb
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add(DEFAULT_ELASTIC_CONFIG, x, y, z)
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
        disposeElasticBoxMesh(pb)
        world.removeRigidBody(pb.body)
        boxes.splice(idx, 1)
        for (const b of boxes) {
            if (b.body.bodyType() === RAPIER.RigidBodyType.Dynamic) b.body.wakeUp()
        }
        rebuildPanelInfo()
    }

    // ── 选中管理 ──

    const select = (id: number | undefined): ElasticBox | undefined => {
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

    const getSelected = (): ElasticBox | undefined => {
        if (selectedId === undefined) return undefined
        return boxes.find(b => b.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    // ── 配置更新 ──

    const updateConfig = (id: number, partial: Partial<ElasticBoxConfig>): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb) return
        const old = pb.config
        const cfg: ElasticBoxConfig = {...old, ...partial}
        const changedSize = partial.width !== undefined || partial.height !== undefined || partial.depth !== undefined
        const changedMass = partial.mass !== undefined && partial.mass !== old.mass
        if (changedSize) {
            const hh = cfg.height / 2
            const oldHh = old.height / 2
            pb.config = cfg
            updateElasticBoxMeshSize(pb)
            world.removeCollider(pb.mainCollider, true)
            const colliderDesc = RAPIER.ColliderDesc.cuboid(cfg.width / 2, hh, cfg.depth / 2)
                .setFriction(0.5)
                /* 密度 0：重建碰撞体不改变刚体质量 */
                .setDensity(0)
                .setCollisionGroups(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'box'))
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
            pb.mainCollider = createColliderForBody(world, colliderDesc, pb.body)
            const pos = pb.body.translation()
            const oldBottom = pos.y - oldHh
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
        if (pb.body.bodyType() === RAPIER.RigidBodyType.Dynamic) pb.body.wakeUp()
        refreshRowText(pb)
    }

    // ── 弹性形变更新（preSync） ──

    const updateDeformation = (dt: number): void => {
        for (const pb of boxes) {
            if (pb.config.mass === 0) continue

            for (const [key, val] of pb.cooldowns) {
                const next = val - dt
                if (next <= 0) pb.cooldowns.delete(key)
                else pb.cooldowns.set(key, next)
            }

            const base = [pb.config.width, pb.config.height, pb.config.depth]
            const omega = Math.sqrt(pb.config.stiffness / pb.config.mass)
            const zeta = pb.config.dampingRatio

            for (let a = 0; a < 3; a++) {
                const aSpring = -omega * omega * pb.def[a]
                const aDamp = -2 * zeta * omega * pb.vel[a]
                pb.vel[a] += (aSpring + aDamp) * dt
                pb.def[a] += pb.vel[a] * dt

                const maxDef = pb.config.maxDeformFraction * base[a]
                const clamped = clamp(pb.def[a], -maxDef, maxDef)
                if (clamped !== pb.def[a]) {
                    pb.def[a] = clamped
                    pb.vel[a] = 0
                }
            }

            const gravityTarget = -base[1] * GRAVITY_SQUASH
            pb.def[1] += (gravityTarget - pb.def[1]) * Math.min(1, dt * 5)

            conserveVolume(pb)
        }
    }

    // ── 同步 ──

    const syncPositions = (): void => {
        for (const pb of boxes) {
            const pos = pb.body.translation()
            pb.mesh.position.set(pos.x, pos.y, pos.z)
            const rot = pb.body.rotation()
            pb.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
            updateElasticBoxMeshSize(pb)
            pb.rowText = formatRowText(pb)
        }
        rebuildPanelInfo()
    }

    // ── 上下文 ──

    const ctxWithoutPanel: Omit<ElasticEntityContext, 'panel'> = {
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
        preSync: updateDeformation,
    }
    return {
        ...ctxWithoutPanel,
        panel: createElasticPanel(ctxWithoutPanel),
    }
}
