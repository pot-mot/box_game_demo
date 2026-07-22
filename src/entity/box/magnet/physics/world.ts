import {type Scene} from 'three'
import {
    Body,
    BODY_TYPES,
    Box,
    Vec3,
} from 'cannon-es'
import type {SharedWorld} from '../../../../physics/world.ts'
import type {PhysicsEnv} from '../../../../physics/env.ts'
import {GROUND_Y, DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../../physics/constants.ts'
import type {MagnetBoxConfig, MagnetBox, MagnetEntityContext} from '../types'
import type {EntityPanelInfo} from '../../base/types/entity_info'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../../base/types/event_emitter'
import {createMagnetBoxMesh, updateMagnetBoxMeshSize, disposeMagnetBoxMesh} from '../render'
import {createWireframe, cleanupWireframe} from '../../base/render'
import {findNonOverlappingY} from '../../base/physics'
import {formatRowText, createMagnetPanel} from '../ui'
import type {PanelContext} from '../../base/ui'
import {DEFAULT_MAGNET_CONFIG, MAX_SPEED} from './constants.ts'
import type {EntityType} from '../../../constants.ts'

// ── 常量 ──

const TYPE: EntityType = 'box/magnet' as const
const BADGE_LABEL = 'M'
const BADGE_COLOR = '#96c'

// ── 临时向量，复用避免 GC ──

const _force = new Vec3()

// ── 初始化 ──

export const setupMagnetBoxes = (scene: Scene, shared: SharedWorld, physicsEnv: PhysicsEnv): MagnetEntityContext => {
    const {world, boxMat} = shared

    const boxes: MagnetBox[] = []
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

    const refreshRowText = (box: MagnetBox): void => {
        box.rowText = formatRowText(box)
        box.emitter.emit('infoUpdate')
    }

    // ── 增删改查 ──

    const add = (config: MagnetBoxConfig, x: number, y: number, z: number): MagnetBox => {
        const id = nextId++
        const adjustedY = findNonOverlappingY(boxes, config, x, y, z)
        const hw = config.width / 2
        const hh = config.height / 2
        const hd = config.depth / 2
        const {mesh, edges} = createMagnetBoxMesh(config)
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
        world.addBody(body)
        const emitter = createEmitter<EntityEventMap>()
        const pb: MagnetBox = {id, mesh, body, config: {...config}, edges, wireframe: undefined, emitter, rowText: ''}
        refreshRowText(pb)
        emitter.on('infoUpdate', rebuildPanelInfo)
        boxes.push(pb)
        rebuildPanelInfo()
        return pb
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add(DEFAULT_MAGNET_CONFIG, x, y, z)
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
        disposeMagnetBoxMesh(pb)
        world.removeBody(pb.body)
        boxes.splice(idx, 1)
        for (const b of boxes) {
            if (b.body.type === BODY_TYPES.DYNAMIC) b.body.wakeUp()
        }
        rebuildPanelInfo()
    }

    // ── 选中管理 ──

    const select = (id: number | undefined): MagnetBox | undefined => {
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

    const getSelected = (): MagnetBox | undefined => {
        if (selectedId === undefined) return undefined
        return boxes.find(b => b.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    // ── 配置更新 ──

    const updateConfig = (id: number, partial: Partial<MagnetBoxConfig>): void => {
        const pb = boxes.find(b => b.id === id)
        if (!pb) return
        const old = pb.config
        const cfg: MagnetBoxConfig = {...old, ...partial}
        const changedSize = partial.width !== undefined || partial.height !== undefined || partial.depth !== undefined
        const changedMass = partial.mass !== undefined && partial.mass !== old.mass
        if (changedSize) {
            const hh = cfg.height / 2
            updateMagnetBoxMeshSize(pb, cfg)
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

    // ── 吸引逻辑（在 preSync 中执行） ──
    // 对范围内的动态 body 施加指向磁铁的力，同时清零角速度防止碰撞旋转

    const applyAttraction = (_dt: number, _time: number): void => {
        if (boxes.length === 0) return

        const allBodies = physicsEnv.getAllBodies()
        const magnetBodyIds = new Set<number>()
        for (const pb of boxes) {
            magnetBodyIds.add(pb.body.id)
        }

        for (const pb of boxes) {
            const radius = pb.config.attractionRadius
            const strength = pb.config.attractionStrength
            if (radius <= 0 || strength <= 0) continue

            const mPos = pb.body.position
            const radiusSq = radius * radius

            for (const target of allBodies) {
                if (magnetBodyIds.has(target.id)) continue
                if (target.type === BODY_TYPES.STATIC) continue

                const tPos = target.position
                const dx = mPos.x - tPos.x
                const dy = mPos.y - tPos.y
                const dz = mPos.z - tPos.z
                const distSq = dx * dx + dy * dy + dz * dz

                if (distSq > 0 && distSq < radiusSq) {
                    // 清零角速度，彻底消除碰撞产生的旋转
                    target.angularVelocity.set(0, 0, 0)

                    // 线速度钳制
                    const v = target.velocity
                    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
                    if (speed > MAX_SPEED) {
                        const scale = MAX_SPEED / speed
                        v.x *= scale; v.y *= scale; v.z *= scale
                    }

                    // 施加指向磁铁的力
                    const dist = Math.sqrt(distSq)
                    const factor = strength * (1 - dist / radius)
                    const invDist = factor / dist
                    _force.set(dx * invDist, dy * invDist, dz * invDist)
                    target.applyForce(_force, tPos)
                }
            }
        }
    }

    // ── 同步 ──

    const syncPositions = (): void => {
        for (const pb of boxes) {
            pb.mesh.position.set(pb.body.position.x, pb.body.position.y, pb.body.position.z)
            pb.mesh.quaternion.set(pb.body.quaternion.x, pb.body.quaternion.y, pb.body.quaternion.z, pb.body.quaternion.w)
            pb.rowText = formatRowText(pb)
        }
        rebuildPanelInfo()
    }

    // ── 上下文 ──

    const ctx: MagnetEntityContext = {
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
        preSync: applyAttraction,
        panel: undefined as unknown as PanelContext,
    }
    ctx.panel = createMagnetPanel(ctx)
    return ctx
}
