import {type Scene, MeshBasicMaterial, LineBasicMaterial} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createColliderForBody} from '../../../../physics/rapier_utils.ts'
import type {SharedWorld} from '../../../../physics/world.ts'
import type {EntityPanelInfo} from '../../../box/base/types/entity_info.ts'
import {createEmitter, type SourceEventMap} from '../../../box/base/types/event_emitter'
import {createWireframe, cleanupWireframe} from '../../../box/base/render'
import {createTerrainMesh, rebuildTerrainMesh} from '../render'

import {DEFAULT_TERRAIN_CONFIG} from '../validation.ts'
import {BRUSH_RADIUS, BRUSH_STRENGTH} from '../../constants.ts'
import {TERRAIN_COLLISION_GROUP, TERRAIN_COLLISION_MASK} from '../../../../physics/constants.ts'

import type {BaseTerrainConfig, BaseTerrainEntity, TerrainSetupOptions, TerrainContext} from '../types'

/** 从高度数组构建 Trimesh 顶点和索引 */
const buildTrimesh = (heights: number[][], gs: number, cs: number): {vertices: Float32Array; indices: Uint32Array} => {
    const n = gs
    const count = n * n
    const vertices = new Float32Array(count * 3)
    const indices: number[] = []
    const half = ((n - 1) * cs) / 2
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const idx = (r * n + c) * 3
            vertices[idx] = c * cs - half
            vertices[idx + 1] = heights[r][c]
            vertices[idx + 2] = r * cs - half
        }
    }
    for (let r = 0; r < n - 1; r++) {
        for (let c = 0; c < n - 1; c++) {
            const a = r * n + c
            const b = a + 1
            const d = a + n
            const e = d + 1
            indices.push(a, b, e)
            indices.push(a, e, d)
        }
    }
    return {vertices, indices: new Uint32Array(indices)}
}

export const createTerrainContextImpl = (
    scene: Scene,
    shared: SharedWorld,
    options: TerrainSetupOptions,
): Omit<TerrainContext, 'panel'> => {
    const {world} = shared
    const entities: BaseTerrainEntity[] = []
    let nextId = 1
    let selectedId: number | undefined
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()

    const getDynamicBodies = options.getDynamicBodies ?? (() => [])

    const rebuildPanelInfo = (): void => {
        panelInfo.length = 0
        for (const t of entities) {
            panelInfo.push({
                id: t.id,
                type: options.type,
                badgeLabel: options.badgeLabel,
                badgeColor: options.badgeColor,
                rowText: t.rowText,
            })
        }
    }

    const formatRowText = (t: BaseTerrainEntity): string =>
        `#${t.id}  (${t.mesh.position.x.toFixed(1)}, ${t.mesh.position.y.toFixed(1)}, ${t.mesh.position.z.toFixed(1)})  ${t.config.gridSize}×${t.config.gridSize}  h:[${t.config.minHeight},${t.config.maxHeight}]`

    const halfSize = (gs: number, cs: number): number => ((gs - 1) * cs) / 2

    // ── CRUD ──

    const add = (config: BaseTerrainConfig, x: number, _y: number, z: number, quat?: {x: number; y: number; z: number; w: number}): BaseTerrainEntity => {
        const id = nextId++
        const generator = options.generators[config.generatorId]
        const heights = generator.generate(config.gridSize, config.cellSize, config.minHeight, config.maxHeight)
        const gs = config.gridSize
        const cs = config.cellSize

        const {mesh, edges} = createTerrainMesh(heights, config)
        mesh.position.set(x, 0, z)
        if (quat) mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w)
        scene.add(mesh)

        const {vertices, indices} = buildTrimesh(heights, gs, cs)

        const bodyDesc = RAPIER.RigidBodyDesc.fixed()
            .setTranslation(x, 0, z)
        if (quat) bodyDesc.setRotation(quat)
        const body = world.createRigidBody(bodyDesc)

        const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
            .setFriction(0.5)
            .setCollisionGroups((TERRAIN_COLLISION_GROUP << 16) | (TERRAIN_COLLISION_MASK & 0xFFFF))
        const mainCollider = createColliderForBody(world, colliderDesc, body)

        const entity: BaseTerrainEntity = {
            id, config: {...config}, heights,
            body, mainCollider, mesh, edges,
            wireframe: undefined,
            rowText: '',
        }
        entity.rowText = formatRowText(entity)
        entities.push(entity)
        liftBoxesOnTerrain(entity, getDynamicBodies)
        rebuildPanelInfo()
        return entity
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add(DEFAULT_TERRAIN_CONFIG, x, y, z)
    }

    const remove = (id: number): void => {
        const idx = entities.findIndex(t => t.id === id)
        if (idx === -1) return
        const t = entities[idx]
        const wasSelected = selectedId === id
        sourceEvents.emit('delete', id, wasSelected)
        if (wasSelected) select(undefined)
        cleanupWireframe(t)
        scene.remove(t.mesh)
        t.mesh.geometry.dispose()
        ;(t.mesh.material as MeshBasicMaterial).dispose()
        t.mesh.remove(t.edges)
        t.edges.geometry.dispose()
        ;(t.edges.material as LineBasicMaterial).dispose()
        world.removeRigidBody(t.body)
        entities.splice(idx, 1)
        rebuildPanelInfo()
    }

    // ── 配置更新（边界重设） ──

    const updateConfig = (id: number, partial: Partial<BaseTerrainConfig>): void => {
        const t = entities.find(e => e.id === id)
        if (!t) return
        const cfg: BaseTerrainConfig = {...t.config, ...partial}
        if (cfg.minHeight > cfg.maxHeight) [cfg.minHeight, cfg.maxHeight] = [cfg.maxHeight, cfg.minHeight]
        t.config = cfg
        const gen = options.generators[cfg.generatorId]
        t.heights = gen.generate(cfg.gridSize, cfg.cellSize, cfg.minHeight, cfg.maxHeight)
        rebuildShape(t)
        liftBoxesOnTerrain(t, getDynamicBodies)
        t.rowText = formatRowText(t)
        rebuildPanelInfo()
    }

    // ── 位置移动 ──

    const updatePosition = (id: number, x: number, z: number): void => {
        const t = entities.find(e => e.id === id)
        if (!t) return
        t.mesh.position.set(x, 0, z)
        t.body.setTranslation({x, y: 0, z}, true)
        t.rowText = formatRowText(t)
        rebuildPanelInfo()
    }

    const setTransform = (id: number, pos: {x: number; y: number; z: number}, rotDeg: {x: number; y: number; z: number}): void => {
        const t = entities.find(e => e.id === id)
        if (!t) return
        t.mesh.position.set(pos.x, 0, pos.z)
        t.mesh.rotation.set(rotDeg.x * Math.PI / 180, rotDeg.y * Math.PI / 180, rotDeg.z * Math.PI / 180)
        t.body.setTranslation({x: pos.x, y: 0, z: pos.z}, true)
        t.body.setRotation(
            {x: t.mesh.quaternion.x, y: t.mesh.quaternion.y, z: t.mesh.quaternion.z, w: t.mesh.quaternion.w},
            true,
        )
        t.rowText = formatRowText(t)
        rebuildPanelInfo()
    }

    // ── 选中管理 ──

    const select = (id: number | undefined): BaseTerrainEntity | undefined => {
        if (selectedId !== undefined) {
            const prev = entities.find(t => t.id === selectedId)
            if (prev) cleanupWireframe(prev)
        }
        selectedId = id
        sourceEvents.emit('select', id)
        if (id !== undefined) {
            const t = entities.find(e => e.id === id)
            if (t) {
                const line = createWireframe(t.mesh.geometry)
                t.mesh.add(line)
                t.wireframe = line
                return t
            }
        }
        return undefined
    }

    const getSelected = (): BaseTerrainEntity | undefined => {
        if (selectedId === undefined) return undefined
        return entities.find(t => t.id === selectedId)
    }

    const getSelectedId = (): number | undefined => selectedId

    // ── 雕刻 ──

    const sculpt = (id: number, worldX: number, worldZ: number, direction: 1 | -1): void => {
        const t = entities.find(e => e.id === id)
        if (!t) return

        const gs = t.config.gridSize
        const cs = t.config.cellSize
        const half = halfSize(gs, cs)
        const lx = worldX - t.mesh.position.x
        const lz = worldZ - t.mesh.position.z
        if (lx < -half || lx > half || lz < -half || lz > half) return

        const centerX = (lx + half) / cs
        const centerZ = (lz + half) / cs

        for (let xi = 0; xi < gs; xi++) {
            for (let zi = 0; zi < gs; zi++) {
                const dist = Math.sqrt((xi - centerX) ** 2 + (zi - centerZ) ** 2)
                if (dist <= BRUSH_RADIUS) {
                    const falloff = 1 - dist / BRUSH_RADIUS
                    t.heights[xi][zi] += direction * BRUSH_STRENGTH * falloff
                    t.heights[xi][zi] = Math.max(t.config.minHeight, Math.min(t.config.maxHeight, t.heights[xi][zi]))
                }
            }
        }

        rebuildShape(t)
        liftBoxesOnTerrain(t, getDynamicBodies)
        t.rowText = formatRowText(t)
        rebuildPanelInfo()
    }

    const rebuildShape = (t: BaseTerrainEntity): void => {
        const gs = t.config.gridSize
        const cs = t.config.cellSize

        const oldWireframe = t.wireframe
        if (oldWireframe) {
            t.mesh.remove(oldWireframe)
            cleanupWireframe(t)
            t.wireframe = undefined
        }

        /* 移除旧碰撞体，重建 Trimesh 碰撞体 */
        world.removeCollider(t.mainCollider, true)

        const {vertices, indices} = buildTrimesh(t.heights, gs, cs)
        const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
            .setFriction(0.5)
            .setCollisionGroups((TERRAIN_COLLISION_GROUP << 16) | (TERRAIN_COLLISION_MASK & 0xFFFF))
        t.mainCollider = createColliderForBody(world, colliderDesc, t.body)

        rebuildTerrainMesh(t, t.heights, t.config)

        if (oldWireframe) {
            const line = createWireframe(t.mesh.geometry)
            t.mesh.add(line)
            t.wireframe = line
        }
    }

    const liftBoxesOnTerrain = (t: BaseTerrainEntity, getBodies: () => readonly RAPIER.RigidBody[]): void => {
        const gs = t.config.gridSize
        const cs = t.config.cellSize
        const half = halfSize(gs, cs)
        const terTrans = t.body.translation()
        for (const b of getBodies()) {
            if (b.bodyType() !== RAPIER.RigidBodyType.Dynamic) continue
            const bTrans = b.translation()
            const lx = bTrans.x - t.mesh.position.x
            const lz = bTrans.z - t.mesh.position.z
            if (lx < -half || lx > half || lz < -half || lz > half) continue
            const xi = Math.round((lx + half) / cs)
            const zi = Math.round((lz + half) / cs)
            if (xi < 0 || xi >= gs || zi < 0 || zi >= gs) continue
            const terrainY = terTrans.y + t.heights[xi][zi]
            let halfH = 0.5
            const bottom = bTrans.y - halfH
            if (bottom < terrainY) {
                b.setTranslation({x: bTrans.x, y: terrainY + halfH, z: bTrans.z}, true)
            }
        }
    }

    // ── 高度查询 ──

    const getHeightAt = (worldX: number, worldZ: number, refY: number): number | undefined => {
        let closestDist = Infinity
        let closestH: number | undefined
        for (const t of entities) {
            const gs = t.config.gridSize
            const cs = t.config.cellSize
            const half = halfSize(gs, cs)
            const lx = worldX - t.mesh.position.x
            const lz = worldZ - t.mesh.position.z
            if (lx < -half || lx > half || lz < -half || lz > half) continue
            const xi = Math.round((lx + half) / cs)
            const zi = Math.round((lz + half) / cs)
            if (xi < 0 || xi >= gs || zi < 0 || zi >= gs) continue
            const h = t.mesh.position.y + t.heights[xi][zi]
            const dist = Math.abs(h - refY)
            if (dist < closestDist) {
                closestDist = dist
                closestH = h
            }
        }
        return closestH
    }

    // ── 同步（no-op，static body）──

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const syncPositions = (_delta?: number, _time?: number): void => {
        // static bodies do not move
    }

    // ── 设置高度（用于存档加载）──

    const setHeights = (id: number, heights: number[][]): void => {
        const t = entities.find(e => e.id === id)
        if (!t) return
        t.heights = heights.map(col => [...col])
        rebuildShape(t)
        liftBoxesOnTerrain(t, getDynamicBodies)
        t.rowText = formatRowText(t)
        rebuildPanelInfo()
    }

    // ── 上下文 ──

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const getBody = (_id: number): RAPIER.RigidBody | undefined => {
        return undefined
    }

    return {
        type: options.type,
        events: sourceEvents,
        panelInfo,
        add,
        spawnAt,
        remove,
        select,
        getSelected,
        getSelectedId,
        getAll: () => entities,
        getEntityList: () => entities,
        getMeshes: () => entities.map(t => t.mesh),
        syncPositions,
        sculpt,
        getHeightAt,
        getBody,
        updateConfig,
        updatePosition,
        setTransform,
        setHeights,
    }
}
