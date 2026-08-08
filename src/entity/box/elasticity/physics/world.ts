import {type Scene} from 'three'
import {Body, BODY_TYPES, Box, Vec3} from 'cannon-es'
import type {SharedWorld} from '../../../../physics/world.ts'
import {GROUND_Y, DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../../physics/constants.ts'
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
): ElasticEntityContext => {
    const {world, boxMat} = shared

    const boxes: ElasticBox[] = []
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

        const body = new Body({
            mass: config.mass,
            type: config.mass === 0 ? BODY_TYPES.STATIC : BODY_TYPES.DYNAMIC,
            material: boxMat,
            collisionFilterGroup: DEFAULT_COLLISION_GROUP,
            collisionFilterMask: DEFAULT_COLLISION_MASK,
        })
        body.addShape(new Box(new Vec3(hw, hh, hd)))
        body.position.set(x, adjustedY, z)
        if (quat) {
            body.quaternion.set(quat.x, quat.y, quat.z, quat.w)
            mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w)
        }
        world.addBody(body)

        // 自重压缩 + 碰撞状态
        const def: [number, number, number] = options?.def ?? [0, -config.height * GRAVITY_SQUASH, 0]
        const vel: [number, number, number] = options?.vel ?? [0, 0, 0]

        // 碰撞冷却
        const cooldowns = new Map<number, number>()

        body.addEventListener('collide', (e: any) => {
            const contact = e.contact
            const isBi = contact.bi === body
            const otherBody = isBi ? contact.bj : contact.bi

            const otherId = otherBody.id
            const cd = cooldowns.get(otherId) || 0
            if (cd > 0) return
            cooldowns.set(otherId, COLLISION_COOLDOWN)

            const normal = isBi ? contact.ni.clone() : contact.ni.clone().negate()

            // 计算相对速度沿法线分量
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
            const impulse = relVel * IMPACT_DEFORM_SCALE

            // 将法线转换到局部空间，确定受撞轴向
            const invQuat = body.quaternion.clone().inverse()
            const localN = invQuat.vmult(normal)
            const lnArr = [localN.x, localN.y, localN.z]
            const absN = [Math.abs(lnArr[0]), Math.abs(lnArr[1]), Math.abs(lnArr[2])]
            const axis = absN.indexOf(Math.max(...absN))

            vel[axis] -= impulse
        })

        const emitter = createEmitter<EntityEventMap>()
        const pb: ElasticBox = {
            id, mesh, body, edges, wireframe: undefined,
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
        world.removeBody(pb.body)
        boxes.splice(idx, 1)
        for (const b of boxes) {
            if (b.body.type === BODY_TYPES.DYNAMIC) b.body.wakeUp()
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
            while (pb.body.shapes.length) pb.body.removeShape(pb.body.shapes[0])
            pb.body.addShape(new Box(new Vec3(cfg.width / 2, hh, cfg.depth / 2)))
            pb.body.updateMassProperties()
            const oldBottom = pb.body.position.y - oldHh
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
        pb.body.position.set(pos.x, pos.y, pos.z)
        pb.mesh.rotation.set(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180)
        pb.body.quaternion.set(pb.mesh.quaternion.x, pb.mesh.quaternion.y, pb.mesh.quaternion.z, pb.mesh.quaternion.w)
        if (pb.body.type === BODY_TYPES.DYNAMIC) pb.body.wakeUp()
        refreshRowText(pb)
    }

    // ── 弹性形变更新（preSync） ──

    const updateDeformation = (dt: number): void => {
        for (const pb of boxes) {
            if (pb.config.mass === 0) continue

            // 递减碰撞冷却
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

            // 自重：Y 轴维持一个微小压缩
            const gravityTarget = -base[1] * GRAVITY_SQUASH
            pb.def[1] += (gravityTarget - pb.def[1]) * Math.min(1, dt * 5)

            conserveVolume(pb)
        }
    }

    // ── 同步 ──

    const syncPositions = (): void => {
        for (const pb of boxes) {
            pb.mesh.position.set(pb.body.position.x, pb.body.position.y, pb.body.position.z)
            pb.mesh.quaternion.set(pb.body.quaternion.x, pb.body.quaternion.y, pb.body.quaternion.z, pb.body.quaternion.w)
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