import {Euler, Group, Quaternion, Vector3, type Camera, type Intersection, type LineSegments, type Raycaster, type Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../physics/world.ts'
import {createEmitter, type SourceEventMap} from '../box/base/types/event_emitter.ts'
import type {EntityPanelInfo} from '../box/base/types/entity_info.ts'
import {MATERIAL_INDEX_TO_ID, SURFACE_MATERIAL_INDEX, type SurfaceMaterialId} from '../../render/materials/index.ts'
import {CHUNK_SIZE, MAX_FILL_BLOCKS, VOXEL_SIZE} from './constants.ts'
import {chunkCoordOf, chunkKey, chunkLocalOf, getBlock, parseChunkKey, setBlock as writeVoxel, type ChunkStore} from './grid/block_world.ts'
import {decodeWorldChunks, encodeWorldChunks} from './grid/world_codec.ts'
import {generateBuilding, type BlockWriter} from './generators/structures.ts'
import {createWorldMeshRenderer, type WorldMeshRenderer} from './render/chunk_renderer.ts'
import {createPropMesh, disposePropMesh} from './render/prop_mesh.ts'
import {createBoxOutline, hideBoxOutline, setBoxOutline} from './render/overlay.ts'
import {createWorldColliderManager, type WorldColliderManager} from './physics/colliders.ts'
import {BUILDING_PROP_KINDS, type BuildingPropKind} from './props/kinds.ts'
import {DEFAULT_BUILDING_CONFIG, type BuildingConfig} from './validation.ts'
import type {
    BlockPick, BuildingGeneratorContext, BuildingProp, BuildingWorld, BuildingWorldSaveData,
} from './types/index.ts'
import {formatRowText, createBuildingPanel} from './ui'

const TYPE = 'building_generator' as const
const BADGE_LABEL = 'B'
const BADGE_COLOR = '#4a7a5a'

export const setupBuildingGenerator = (scene: Scene, shared: SharedWorld): BuildingGeneratorContext => {
    const worlds: BuildingWorld[] = []
    const renderers = new Map<number, WorldMeshRenderer>()
    const colliders = new Map<number, WorldColliderManager>()
    /** 每世界的选中高亮 / 区域预览线框 */
    const overlays = new Map<number, {selection: LineSegments; preview: LineSegments}>()
    /** 每世界的体素包围盒（无方块时缺省） */
    const bounds = new Map<number, {min: [number, number, number]; max: [number, number, number]}>()
    /** 需要重算包围盒的世界（清除方块 / 载入后） */
    const boundsDirty = new Set<number>()
    let nextId = 1
    let selectedId: number | undefined
    const panelInfo: EntityPanelInfo[] = []
    const sourceEvents = createEmitter<SourceEventMap>()

    const rebuildPanelInfo = (): void => {
        panelInfo.length = 0
        for (const w of worlds) {
            panelInfo.push({
                id: w.id,
                type: TYPE,
                badgeLabel: BADGE_LABEL,
                badgeColor: BADGE_COLOR,
                rowText: w.rowText,
            })
        }
    }

    const refreshRowText = (world: BuildingWorld): void => {
        world.rowText = formatRowText(world)
        /* 同步面板行文本（panelInfo 在渲染时按引用读取） */
        const info = panelInfo.find(entry => entry.id === world.id)
        if (info !== undefined) info.rowText = world.rowText
    }

    /** 依据道具数据重建道具网格（道具数量少，整体重建即可） */
    const rebuildPropMeshes = (world: BuildingWorld): void => {
        for (const child of [...world.propGroup.children]) {
            world.propGroup.remove(child)
            if (child instanceof Group) disposePropMesh(child)
        }
        for (const prop of world.props) {
            const mesh = createPropMesh(prop.kind, prop.material, prop.yawQuarter)
            mesh.position.set(prop.position[0], prop.position[1], prop.position[2])
            world.propGroup.add(mesh)
        }
    }

    /** 扫描全部 chunk 重算体素包围盒（仅选中世界按需调用） */
    const recomputeBounds = (world: BuildingWorld): void => {
        let min: [number, number, number] | undefined
        let max: [number, number, number] | undefined
        for (const [key, data] of world.chunks) {
            const [cx, cy, cz] = parseChunkKey(key)
            for (let i = 0; i < data.length; i++) {
                if (data[i] === 0) continue
                const lz = i % CHUNK_SIZE
                const ly = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE
                const lx = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE))
                const wx = cx * CHUNK_SIZE + lx
                const wy = cy * CHUNK_SIZE + ly
                const wz = cz * CHUNK_SIZE + lz
                if (min === undefined || max === undefined) {
                    min = [wx, wy, wz]
                    max = [wx, wy, wz]
                } else {
                    min[0] = Math.min(min[0], wx)
                    min[1] = Math.min(min[1], wy)
                    min[2] = Math.min(min[2], wz)
                    max[0] = Math.max(max[0], wx)
                    max[1] = Math.max(max[1], wy)
                    max[2] = Math.max(max[2], wz)
                }
            }
        }
        if (min !== undefined && max !== undefined) bounds.set(world.id, {min, max})
        else bounds.delete(world.id)
    }

    const refreshSelectionOutline = (world: BuildingWorld): void => {
        const overlay = overlays.get(world.id)
        if (overlay === undefined) return
        const box = bounds.get(world.id)
        if (box === undefined) {
            hideBoxOutline(overlay.selection)
            return
        }
        setBoxOutline(overlay.selection, box.min, box.max)
    }

    const markChunk = (world: BuildingWorld, cx: number, cy: number, cz: number): void => {
        const key = chunkKey(cx, cy, cz)
        world.dirty.add(key)
        world.colliderDirty.add(key)
    }

    const writeBlock = (world: BuildingWorld, lx: number, ly: number, lz: number, value: number): void => {
        writeVoxel(world.chunks, lx, ly, lz, value)
        const cx = chunkCoordOf(lx)
        const cy = chunkCoordOf(ly)
        const cz = chunkCoordOf(lz)
        markChunk(world, cx, cy, cz)
        /* 面剔除跨 chunk：边界体素写入会改变相邻 chunk 的可见面，需一并失效 */
        const localX = chunkLocalOf(lx)
        const localY = chunkLocalOf(ly)
        const localZ = chunkLocalOf(lz)
        if (localX === 0) markChunk(world, cx - 1, cy, cz)
        if (localX === CHUNK_SIZE - 1) markChunk(world, cx + 1, cy, cz)
        if (localY === 0) markChunk(world, cx, cy - 1, cz)
        if (localY === CHUNK_SIZE - 1) markChunk(world, cx, cy + 1, cz)
        if (localZ === 0) markChunk(world, cx, cy, cz - 1)
        if (localZ === CHUNK_SIZE - 1) markChunk(world, cx, cy, cz + 1)
        if (value === 0) {
            /* 清除后包围盒可能收缩：标记为待重算 */
            boundsDirty.add(world.id)
            return
        }
        const box = bounds.get(world.id)
        if (box === undefined) {
            bounds.set(world.id, {min: [lx, ly, lz], max: [lx, ly, lz]})
        } else {
            box.min[0] = Math.min(box.min[0], lx)
            box.min[1] = Math.min(box.min[1], ly)
            box.min[2] = Math.min(box.min[2], lz)
            box.max[0] = Math.max(box.max[0], lx)
            box.max[1] = Math.max(box.max[1], ly)
            box.max[2] = Math.max(box.max[2], lz)
        }
    }

    const createWorld = (config: BuildingConfig, x: number, y: number, z: number, yawQuarter: number): BuildingWorld => {
        const id = nextId++
        const yaw = yawQuarter * Math.PI / 2
        const group = new Group()
        group.position.set(x, y, z)
        group.rotation.y = yaw
        scene.add(group)

        const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z)
        const q = new Quaternion().setFromEuler(new Euler(0, yaw, 0))
        bodyDesc.setRotation({x: q.x, y: q.y, z: q.z, w: q.w})
        const body = shared.world.createRigidBody(bodyDesc)

        const chunks: ChunkStore = new Map()
        const props: BuildingProp[] = []
        const propGroup = new Group()
        group.add(propGroup)
        const selection = createBoxOutline('selection')
        const preview = createBoxOutline('preview')
        group.add(selection)
        group.add(preview)
        overlays.set(id, {selection, preview})
        boundsDirty.add(id)
        const dirty = new Set<string>()
        const colliderDirty = new Set<string>()
        const world: BuildingWorld = {
            id, config: {...config}, group, body, chunks, props, propGroup, dirty, colliderDirty, yawQuarter, rowText: '',
        }
        renderers.set(id, createWorldMeshRenderer(group, chunks, dirty))
        colliders.set(id, createWorldColliderManager(shared.world, body, chunks))
        return world
    }

    /** 清空世界的体素与已构建网格 / 碰撞体（保留世界实体与自由道具） */
    const clearWorldChunks = (world: BuildingWorld): void => {
        renderers.get(world.id)?.clear()
        colliders.get(world.id)?.clear()
        world.chunks.clear()
        world.dirty.clear()
        world.colliderDirty.clear()
        bounds.delete(world.id)
        boundsDirty.add(world.id)
    }

    const add = (config: BuildingConfig, x: number, y: number, z: number): BuildingWorld => {
        const world = createWorld(config, x, y, z, 0)
        const writer: BlockWriter = {
            set: (lx, ly, lz, material: SurfaceMaterialId) => writeBlock(world, lx, ly, lz, SURFACE_MATERIAL_INDEX[material]),
            clear: (lx, ly, lz) => writeBlock(world, lx, ly, lz, 0),
        }
        generateBuilding(config, writer)
        for (const key of world.chunks.keys()) {
            world.dirty.add(key)
            world.colliderDirty.add(key)
        }
        worlds.push(world)
        refreshRowText(world)
        rebuildPanelInfo()
        return world
    }

    const updateConfig = (id: number, config: BuildingConfig): void => {
        const world = worlds.find(w => w.id === id)
        if (!world) return
        clearWorldChunks(world)
        const writer: BlockWriter = {
            set: (lx, ly, lz, material: SurfaceMaterialId) => writeBlock(world, lx, ly, lz, SURFACE_MATERIAL_INDEX[material]),
            clear: (lx, ly, lz) => writeBlock(world, lx, ly, lz, 0),
        }
        generateBuilding(config, writer)
        world.config = {...config}
        for (const key of world.chunks.keys()) {
            world.dirty.add(key)
            world.colliderDirty.add(key)
        }
        refreshRowText(world)
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        add(DEFAULT_BUILDING_CONFIG, x, y, z)
    }

    const remove = (id: number): void => {
        const idx = worlds.findIndex(w => w.id === id)
        if (idx === -1) return
        const world = worlds[idx]
        const wasSelected = selectedId === id
        sourceEvents.emit('delete', id, wasSelected)
        if (wasSelected) select(undefined)
        renderers.get(id)?.dispose()
        renderers.delete(id)
        colliders.get(id)?.dispose()
        colliders.delete(id)
        for (const child of [...world.propGroup.children]) {
            if (child instanceof Group) disposePropMesh(child)
        }
        overlays.delete(id)
        bounds.delete(id)
        boundsDirty.delete(id)
        scene.remove(world.group)
        shared.world.removeRigidBody(world.body)
        worlds.splice(idx, 1)
        rebuildPanelInfo()
    }

    const select = (id: number | undefined): BuildingWorld | undefined => {
        if (selectedId !== undefined && selectedId !== id) {
            const previous = overlays.get(selectedId)
            if (previous) hideBoxOutline(previous.selection)
        }
        setRegionPreview(undefined)
        selectedId = id
        sourceEvents.emit('select', id)
        if (id === undefined) return undefined
        const world = worlds.find(w => w.id === id)
        if (world !== undefined) {
            recomputeBounds(world)
            boundsDirty.delete(id)
            refreshSelectionOutline(world)
        }
        return world
    }

    const getSelected = (): BuildingWorld | undefined =>
        selectedId === undefined ? undefined : worlds.find(w => w.id === selectedId)

    const getSelectedId = (): number | undefined => selectedId

    const setTransform = (
        id: number,
        pos: {x: number; y: number; z: number},
        rotDeg: {x: number; y: number; z: number},
    ): void => {
        const world = worlds.find(w => w.id === id)
        if (!world) return
        const yawQuarter = ((Math.round(rotDeg.y / 90) % 4) + 4) % 4
        const yaw = yawQuarter * Math.PI / 2
        world.yawQuarter = yawQuarter
        world.group.position.set(pos.x, pos.y, pos.z)
        world.group.rotation.y = yaw
        world.body.setTranslation({x: pos.x, y: pos.y, z: pos.z}, true)
        const q = new Quaternion().setFromEuler(new Euler(0, yaw, 0))
        world.body.setRotation({x: q.x, y: q.y, z: q.z, w: q.w}, true)
        refreshRowText(world)
    }

    const setBlock = (id: number, x: number, y: number, z: number, material?: SurfaceMaterialId): void => {
        const world = worlds.find(w => w.id === id)
        if (!world) return
        writeBlock(world, x, y, z, material === undefined ? 0 : SURFACE_MATERIAL_INDEX[material])
        refreshRowText(world)
    }

    const getBlockMaterial = (id: number, x: number, y: number, z: number): SurfaceMaterialId | undefined => {
        const world = worlds.find(w => w.id === id)
        if (!world) return undefined
        const value = getBlock(world.chunks, x, y, z)
        return value === 0 ? undefined : MATERIAL_INDEX_TO_ID[value]
    }

    const fillRegion = (
        id: number,
        x0: number, y0: number, z0: number,
        x1: number, y1: number, z1: number,
        material?: SurfaceMaterialId,
    ): void => {
        const world = worlds.find(w => w.id === id)
        if (!world) return
        const minX = Math.min(x0, x1)
        const maxX = Math.max(x0, x1)
        const minY = Math.min(y0, y1)
        const maxY = Math.max(y0, y1)
        const minZ = Math.min(z0, z1)
        const maxZ = Math.max(z0, z1)
        const count = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1)
        if (count > MAX_FILL_BLOCKS) return
        const value = material === undefined ? 0 : SURFACE_MATERIAL_INDEX[material]
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) writeBlock(world, x, y, z, value)
            }
        }
        refreshRowText(world)
    }

    const replaceMaterial = (id: number, from: SurfaceMaterialId, to: SurfaceMaterialId): void => {
        const world = worlds.find(w => w.id === id)
        if (!world) return
        const fromIndex = SURFACE_MATERIAL_INDEX[from]
        const toIndex = SURFACE_MATERIAL_INDEX[to]
        if (fromIndex === toIndex) return
        for (const [key, data] of world.chunks) {
            let changed = false
            for (let i = 0; i < data.length; i++) {
                if (data[i] === fromIndex) {
                    data[i] = toIndex
                    changed = true
                }
            }
            if (changed) {
                world.dirty.add(key)
                world.colliderDirty.add(key)
            }
        }
        refreshRowText(world)
    }

    const replaceMaterialInRegion = (
        id: number,
        from: SurfaceMaterialId,
        to: SurfaceMaterialId,
        x0: number, y0: number, z0: number,
        x1: number, y1: number, z1: number,
    ): void => {
        const world = worlds.find(w => w.id === id)
        if (!world) return
        const fromIndex = SURFACE_MATERIAL_INDEX[from]
        const toIndex = SURFACE_MATERIAL_INDEX[to]
        if (fromIndex === toIndex) return
        const minX = Math.min(x0, x1)
        const maxX = Math.max(x0, x1)
        const minY = Math.min(y0, y1)
        const maxY = Math.max(y0, y1)
        const minZ = Math.min(z0, z1)
        const maxZ = Math.max(z0, z1)
        const count = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1)
        if (count > MAX_FILL_BLOCKS) return
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    if (getBlock(world.chunks, x, y, z) === fromIndex) writeBlock(world, x, y, z, toIndex)
                }
            }
        }
        refreshRowText(world)
    }

    const stampPrefab = (id: number, config: BuildingConfig, x: number, y: number, z: number): void => {
        const world = worlds.find(w => w.id === id)
        if (!world) return
        const writer: BlockWriter = {
            set: (lx, ly, lz, material) => writeBlock(world, lx + x, ly + y, lz + z, SURFACE_MATERIAL_INDEX[material]),
            clear: (lx, ly, lz) => writeBlock(world, lx + x, ly + y, lz + z, 0),
        }
        generateBuilding(config, writer)
        refreshRowText(world)
    }

    const placeProp = (
        id: number,
        kind: BuildingPropKind,
        material: SurfaceMaterialId,
        x: number, y: number, z: number,
        yawQuarter: number,
    ): void => {
        const world = worlds.find(w => w.id === id)
        if (!world) return
        world.props.push({kind, material, position: [x, y, z], yawQuarter})
        rebuildPropMeshes(world)
        refreshRowText(world)
    }

    const updateProp = (
        id: number,
        index: number,
        partial: Partial<Pick<BuildingProp, 'material' | 'yawQuarter'>>,
    ): void => {
        const world = worlds.find(w => w.id === id)
        if (!world) return
        const prop = world.props[index]
        if (prop === undefined) return
        if (partial.material !== undefined) prop.material = partial.material
        if (partial.yawQuarter !== undefined) prop.yawQuarter = partial.yawQuarter
        rebuildPropMeshes(world)
        refreshRowText(world)
    }

    const removeProp = (id: number, index: number): void => {
        const world = worlds.find(w => w.id === id)
        if (!world) return
        if (index < 0 || index >= world.props.length) return
        world.props.splice(index, 1)
        rebuildPropMeshes(world)
        refreshRowText(world)
    }

    /** 区域预览：先隐藏所有预览，再按需显示目标世界 */
    const setRegionPreview = (
        worldId: number | undefined,
        min?: readonly [number, number, number],
        max?: readonly [number, number, number],
    ): void => {
        for (const overlay of overlays.values()) hideBoxOutline(overlay.preview)
        if (worldId === undefined || min === undefined || max === undefined) return
        const overlay = overlays.get(worldId)
        if (overlay === undefined) return
        setBoxOutline(overlay.preview, min, max)
    }

    const localPoint = new Vector3()
    const pickBlock = (raycaster: Raycaster): BlockPick | undefined => {
        let best: {world: BuildingWorld; hit: Intersection} | undefined
        for (const world of worlds) {
            const renderer = renderers.get(world.id)
            if (renderer === undefined) continue
            const meshes = renderer.getPickMeshes()
            if (meshes.length === 0) continue
            const hits = raycaster.intersectObjects(meshes, false)
            if (hits.length === 0) continue
            if (best === undefined || hits[0].distance < best.hit.distance) {
                best = {world, hit: hits[0]}
            }
        }
        if (best === undefined) return undefined

        const {world, hit} = best
        world.group.updateWorldMatrix(true, false)
        localPoint.copy(hit.point)
        world.group.worldToLocal(localPoint)
        const faceNormal = hit.face?.normal
        /* `| 0` 归一化 -0，并保证法线 / 体素坐标为整数 */
        const normal: [number, number, number] = faceNormal
            ? [Math.round(faceNormal.x) | 0, Math.round(faceNormal.y) | 0, Math.round(faceNormal.z) | 0]
            : [0, 1, 0]
        /* 命中点位于面上：沿 -法线内推半格取样，得到命中面所属的实心体素 */
        const block: [number, number, number] = [
            Math.floor((localPoint.x - normal[0] * VOXEL_SIZE * 0.5) / VOXEL_SIZE) | 0,
            Math.floor((localPoint.y - normal[1] * VOXEL_SIZE * 0.5) / VOXEL_SIZE) | 0,
            Math.floor((localPoint.z - normal[2] * VOXEL_SIZE * 0.5) / VOXEL_SIZE) | 0,
        ]
        return {worldId: world.id, block, normal}
    }

    const getSaveWorlds = (): BuildingWorldSaveData[] =>
        worlds.map(world => ({
            origin: [world.group.position.x, world.group.position.y, world.group.position.z],
            yawQuarter: world.yawQuarter,
            ...encodeWorldChunks(world.chunks),
            props: world.props.map(prop => ({
                kind: prop.kind,
                material: prop.material,
                position: [prop.position[0], prop.position[1], prop.position[2]],
                yawQuarter: prop.yawQuarter,
            })),
        }))

    const loadSaveWorlds = (list: BuildingWorldSaveData[]): void => {
        for (const data of list) {
            const [x, y, z] = data.origin
            const world = createWorld({...DEFAULT_BUILDING_CONFIG, recipe: 'saved'}, x, y, z, data.yawQuarter)
            const decoded = decodeWorldChunks(data.palette, data.chunks)
            for (const [key, value] of decoded) {
                world.chunks.set(key, value)
                world.dirty.add(key)
                world.colliderDirty.add(key)
            }
            /* 道具：非法种类 / 材质安全跳过 */
            for (const prop of data.props ?? []) {
                if (!BUILDING_PROP_KINDS.some(kind => kind === prop.kind)) continue
                if (SURFACE_MATERIAL_INDEX[prop.material] === undefined) continue
                world.props.push({
                    kind: prop.kind,
                    material: prop.material,
                    position: [prop.position[0], prop.position[1], prop.position[2]],
                    yawQuarter: prop.yawQuarter,
                })
            }
            rebuildPropMeshes(world)
            worlds.push(world)
            refreshRowText(world)
        }
        rebuildPanelInfo()
    }

    const cameraLocal = new Vector3()
    const updateView = (camera: Camera): void => {
        for (const world of worlds) {
            world.group.updateWorldMatrix(true, false)
            cameraLocal.copy(camera.position)
            world.group.worldToLocal(cameraLocal)
            renderers.get(world.id)?.update(cameraLocal)
            colliders.get(world.id)?.update(cameraLocal, world.colliderDirty)
        }
        /* 选中世界的包围盒变化后刷新选中高亮（每帧至多一次重算） */
        if (selectedId !== undefined && boundsDirty.has(selectedId)) {
            const world = worlds.find(w => w.id === selectedId)
            if (world !== undefined) {
                recomputeBounds(world)
                refreshSelectionOutline(world)
            }
            boundsDirty.delete(selectedId)
        }
    }

    const syncPositions = (): void => {
        /* 静态建筑世界不参与物理步进：位置由 add/setTransform 决定，无需逐帧同步 */
    }

    const ctxWithoutPanel: Omit<BuildingGeneratorContext, 'panel'> = {
        type: TYPE,
        events: sourceEvents,
        panelInfo,
        add,
        updateConfig,
        spawnAt,
        remove,
        select,
        getSelected,
        getSelectedId,
        getAll: () => worlds,
        getEntityList: () => worlds.map(w => ({id: w.id, mesh: w.group})),
        getMeshes: () => {
            const meshes = []
            for (const world of worlds) {
                const renderer = renderers.get(world.id)
                if (renderer) meshes.push(...renderer.getPickMeshes())
            }
            return meshes
        },
        syncPositions,
        setTransform,
        setBlock,
        getBlockMaterial,
        fillRegion,
        replaceMaterial,
        replaceMaterialInRegion,
        stampPrefab,
        placeProp,
        updateProp,
        removeProp,
        setRegionPreview,
        pickBlock,
        getSaveWorlds,
        loadSaveWorlds,
        updateView,
    }
    return {
        ...ctxWithoutPanel,
        panel: createBuildingPanel(ctxWithoutPanel),
    }
}
