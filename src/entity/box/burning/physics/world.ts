import {type Scene, ShaderMaterial} from 'three'
import {
    Body,
    BODY_TYPES,
    Box,
    Vec3,
} from 'cannon-es'
import type {SharedWorld} from '../../../../physics/world.ts'
import {GROUND_Y, DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK} from '../../../../physics/constants.ts'
import type {BurningBoxConfig, BurningBox, BurningEntityContext} from '../types'
import type {EntityPanelInfo} from '../../base/types/entity_info'
import {createEmitter, type EntityEventMap, type SourceEventMap} from '../../base/types/event_emitter'
import {
    createBurningBoxMesh, updateBurningBoxMeshSize, disposeBurningBoxMesh,
    createParticleData, createParticlePoints, updateParticles, disposeParticlePoints,
} from '../render'
import {createWireframe, cleanupWireframe} from '../../base/render'
import {findNonOverlappingY} from '../../base/physics'
import {formatRowText, createBurningPanel} from '../ui'
import type {PanelContext} from '../../base/ui'
import {DEFAULT_BURNING_CONFIG} from './constants.ts'
import type {EntityType} from '../../../constants.ts'

const TYPE: EntityType = 'box/burning' as const
const BADGE_LABEL = 'B'
const BADGE_COLOR = '#f44'

export const setupBurningBoxes = (scene: Scene, shared: SharedWorld): BurningEntityContext => {
    const {world, boxMat} = shared

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

    const add = (config: BurningBoxConfig, x: number, y: number, z: number): BurningBox => {
        const id = nextId++
        const adjustedY = findNonOverlappingY(boxes, config, x, y, z)
        const hw = config.width / 2
        const hh = config.height / 2
        const hd = config.depth / 2

        const {mesh, edges} = createBurningBoxMesh(config)
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

        const particleData = createParticleData()
        const particles = createParticlePoints()
        particles.position.set(x, adjustedY, z)
        scene.add(particles)

        const emitter = createEmitter<EntityEventMap>()
        const pb: BurningBox = {
            id, mesh, body, edges, wireframe: undefined,
            config: {...config}, burnProgress: 0,
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
        world.removeBody(pb.body)
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
        pb.particles.position.set(pos.x, pos.y, pos.z)
        if (pb.body.type === BODY_TYPES.DYNAMIC) pb.body.wakeUp()
        refreshRowText(pb)
    }

    const updatePhysics = (dt: number): void => {
        for (let i = boxes.length - 1; i >= 0; i--) {
            const pb = boxes[i]

            pb.burnProgress += dt / pb.config.burnDuration

            const mat = pb.mesh.material as ShaderMaterial
            mat.uniforms.uBurnProgress.value = pb.burnProgress
            mat.uniforms.uTime.value += dt

            // 质量随燃烧递减
            const massScale = 1.0 - pb.burnProgress * 0.8
            if (pb.body.type === BODY_TYPES.DYNAMIC) {
                pb.body.mass = pb.config.mass * massScale
                pb.body.updateMassProperties()
            }

            // 更新粒子
            updateParticles(
                pb.particleData, pb.particles, dt, pb.config, pb.burnProgress,
            )

            refreshRowText(pb)

            if (pb.burnProgress >= 1) {
                const wasSelected = selectedId === pb.id
                sourceEvents.emit('delete', pb.id, wasSelected)
                if (wasSelected) select(undefined)
                cleanupWireframe(pb)
                scene.remove(pb.mesh)
                disposeBurningBoxMesh(pb)
                scene.remove(pb.particles)
                disposeParticlePoints(pb.particles)
                world.removeBody(pb.body)
                boxes.splice(i, 1)
                rebuildPanelInfo()
            }
        }
        rebuildPanelInfo()
    }

    // 存储 particleData 在 box 对象上
    const syncPositions = (): void => {
        for (const pb of boxes) {
            pb.mesh.position.set(pb.body.position.x, pb.body.position.y, pb.body.position.z)
            pb.mesh.quaternion.set(pb.body.quaternion.x, pb.body.quaternion.y, pb.body.quaternion.z, pb.body.quaternion.w)
            pb.particles.position.set(pb.body.position.x, pb.body.position.y, pb.body.position.z)
            pb.rowText = formatRowText(pb)
        }
        rebuildPanelInfo()
    }

    const ctx: BurningEntityContext = {
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
        updatePhysics,
        panel: undefined as unknown as PanelContext,
    }
    ctx.panel = createBurningPanel(ctx)
    return ctx
}
