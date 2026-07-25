import {type Scene, MeshBasicMaterial, LineBasicMaterial} from 'three'
import {BODY_TYPES, Heightfield, Body, Vec3} from 'cannon-es'
import type {SharedWorld} from '../../../../physics/world.ts'
import type {EntityPanelInfo} from '../../../box/base/types/entity_info.ts'
import {createEmitter, type SourceEventMap} from '../../../box/base/types/event_emitter'
import {createWireframe, cleanupWireframe} from '../../../box/base/render'
import {createTerrainMesh, rebuildTerrainMesh} from '../render'
import type {PanelContext} from '../../../box/base/ui'
import {DEFAULT_TERRAIN_CONFIG, TERRAIN_COLLISION_GROUP, TERRAIN_COLLISION_MASK, BRUSH_RADIUS, BRUSH_STRENGTH} from '../../constants.ts'
import type {EntityType} from '../../../constants.ts'
import type {BaseTerrainConfig, BaseTerrainEntity, TerrainSetupOptions, TerrainContext, HeightGenerator} from '../types'

const heightsFromGenerator = (generator: HeightGenerator, config: BaseTerrainConfig): number[][] => {
    return generator.generate(config.gridSize, config.cellSize, config.maxHeight)
}

const reverseZ = (heights: number[][]): number[][] => heights.map(col => [...col].reverse())

export const createTerrainContextImpl = (
    scene: Scene,
    shared: SharedWorld,
    options: TerrainSetupOptions,
): TerrainContext => {
    const {world, boxMat} = shared
    const entities: BaseTerrainEntity[] = []
    let nextId = 1
    let selectedId: number | undefined
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()

    const rebuildPanelInfo = (): void => {
        panelInfo.length = 0
        for (const t of entities) {
            panelInfo.push({
                id: t.id,
                type: options.type as unknown as EntityType,
                badgeLabel: options.badgeLabel,
                badgeColor: options.badgeColor,
                rowText: t.rowText,
            })
        }
    }

    const formatRowText = (t: BaseTerrainEntity): string =>
        `#${t.id}  (${t.mesh.position.x.toFixed(1)}, ${t.mesh.position.y.toFixed(1)}, ${t.mesh.position.z.toFixed(1)})  ${t.config.gridSize}×${t.config.gridSize}  h:${t.config.maxHeight}`

    const halfSize = (gs: number, cs: number): number => ((gs - 1) * cs) / 2

    // ── CRUD ──

    const add = (config: BaseTerrainConfig, x: number, _y: number, z: number): BaseTerrainEntity => {
        const id = nextId++
        const heights = heightsFromGenerator(options.generator, config)
        const gs = config.gridSize
        const cs = config.cellSize
        const half = halfSize(gs, cs)

        const body = new Body({
            mass: 0,
            type: BODY_TYPES.STATIC,
            material: boxMat,
            collisionFilterGroup: TERRAIN_COLLISION_GROUP,
            collisionFilterMask: TERRAIN_COLLISION_MASK,
        })
        body.addShape(new Heightfield(reverseZ(heights), {elementSize: cs}))
        body.position.set(x - half, 0, z + half)
        body.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2)
        world.addBody(body)

        const {mesh, edges} = createTerrainMesh(heights, config)
        mesh.position.set(x, 0, z)
        scene.add(mesh)

        const entity: BaseTerrainEntity = {
            id, config: {...config}, heights,
            body, mesh, edges,
            wireframe: undefined,
            rowText: '',
        }
        entity.rowText = formatRowText(entity)
        entities.push(entity)
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
        world.removeBody(t.body)
        entities.splice(idx, 1)
        rebuildPanelInfo()
    }

    // ── 配置更新（边界重设） ──

    const updateConfig = (id: number, partial: Partial<BaseTerrainConfig>): void => {
        const t = entities.find(e => e.id === id)
        if (!t) return
        const cfg: BaseTerrainConfig = {...t.config, ...partial}
        t.config = cfg
        t.heights = heightsFromGenerator(options.generator, cfg)
        rebuildShape(t)
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
                    t.heights[xi][zi] = Math.max(0, Math.min(t.config.maxHeight, t.heights[xi][zi]))
                }
            }
        }

        rebuildShape(t)
        liftBoxesOnTerrain(t, shared)
        t.rowText = formatRowText(t)
        rebuildPanelInfo()
    }

    const rebuildShape = (t: BaseTerrainEntity): void => {
        const gs = t.config.gridSize
        const cs = t.config.cellSize
        const half = halfSize(gs, cs)

        const oldWireframe = t.wireframe
        if (oldWireframe) {
            t.mesh.remove(oldWireframe)
            cleanupWireframe(t)
            t.wireframe = undefined
        }

        while (t.body.shapes.length) t.body.removeShape(t.body.shapes[0])
        t.body.addShape(new Heightfield(reverseZ(t.heights), {elementSize: cs}))
        t.body.position.set(t.mesh.position.x - half, 0, t.mesh.position.z + half)

        rebuildTerrainMesh(t, t.heights, t.config)

        if (oldWireframe) {
            const line = createWireframe(t.mesh.geometry)
            t.mesh.add(line)
            t.wireframe = line
        }
    }

    const liftBoxesOnTerrain = (t: BaseTerrainEntity, s: SharedWorld): void => {
        const gs = t.config.gridSize
        const cs = t.config.cellSize
        const half = halfSize(gs, cs)
        const bodies: Body[] = []
        s.world.bodies.forEach(b => { if (b.type === BODY_TYPES.DYNAMIC) bodies.push(b) })
        for (const b of bodies) {
            if (b.shapes.length === 0) continue
            const lx = b.position.x - t.mesh.position.x
            const lz = b.position.z - t.mesh.position.z
            if (lx < -half || lx > half || lz < -half || lz > half) continue
            const xi = Math.round((lx + half) / cs)
            const zi = Math.round((lz + half) / cs)
            if (xi < 0 || xi >= gs || zi < 0 || zi >= gs) continue
            const terrainY = t.body.position.y + t.heights[xi][zi]
            const halfH = b.shapes[0].boundingSphereRadius || 0.5
            const bottom = b.position.y - halfH
            if (bottom < terrainY) {
                b.position.y = terrainY + halfH
                b.wakeUp()
            }
        }
    }

    // ── 高度查询 ──

    const getHeightAt = (worldX: number, worldZ: number): number | undefined => {
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
            return t.mesh.position.y + t.heights[xi][zi]
        }
        return undefined
    }

    // ── 同步（no-op，static body）──

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const syncPositions = (_delta?: number, _time?: number): void => {
        // static bodies do not move
    }

    // ── 上下文 ──

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const getBody = (_id: number): Body | undefined => {
        return undefined
    }

    const ctx: TerrainContext = {
        type: options.type as unknown as EntityType,
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
        panel: undefined as unknown as PanelContext,
    }
    return ctx
}
