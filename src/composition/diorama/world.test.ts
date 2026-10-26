import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../physics/world.ts'
import {setupBuildingGenerator} from '../../entity/building_generator/world.ts'
import {setupTerrain} from '../../entity/terrain/common/physics/world.ts'
import {createOwnershipStore} from '../../types/ownership_store.ts'
import {collectWorldState} from '../../save_load/serialize.ts'
import {loadWorldFromData} from '../../save_load/deserialize.ts'
import type {EntityInfoSource} from '../../entity/box/base/types/entity_info.ts'
import type {TerrainContext} from '../../entity/terrain/base/types/index.ts'
import {setupDioramas} from './world.ts'
import {DIORAMA_BLUEPRINT_VERSION, type DioramaBlueprint, type DioramaPorts} from './types.ts'

const canvasCtxStub = (): Record<string, unknown> => ({
    strokeStyle: '', fillStyle: '', lineWidth: 0,
    save: () => {}, restore: () => {}, translate: () => {}, beginPath: () => {},
    closePath: () => {}, moveTo: () => {}, lineTo: () => {}, arc: () => {},
    stroke: () => {}, fill: () => {}, fillRect: () => {},
})
const originalGetContext = HTMLCanvasElement.prototype.getContext

beforeAll(async () => {
    await RAPIER.init()
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => canvasCtxStub(), configurable: true, writable: true,
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: originalGetContext, configurable: true, writable: true,
    })
})

const blueprint = (): DioramaBlueprint => ({
    version: DIORAMA_BLUEPRINT_VERSION,
    recipeId: 'test',
    seed: 3,
    nodes: [
        {
            kind: 'terrain',
            nodeId: 'ground',
            position: [-8, 0, -8],
            yawQuarter: 0,
            config: {gridSize: 16, cellSize: 1, minHeight: 0, maxHeight: 0, friction: 0.3, generatorId: 'flat'},
        },
        {
            kind: 'building',
            nodeId: 'house',
            position: [-4, 0, -4],
            yawQuarter: 0,
            config: {recipe: 'house', seed: 1, sizeX: 8, sizeY: 5, sizeZ: 8},
        },
    ],
    population: [],
})

describe('箱庭实体上下文', () => {
    let scene: Scene
    let building: ReturnType<typeof setupBuildingGenerator>
    let terrain: TerrainContext
    let ownership: ReturnType<typeof createOwnershipStore>
    let dioramas: ReturnType<typeof setupDioramas>
    let ports: DioramaPorts

    beforeEach(() => {
        scene = new Scene()
        const shared = createSharedWorld()
        building = setupBuildingGenerator(scene, shared)
        terrain = setupTerrain(scene, shared, () => [])
        ownership = createOwnershipStore()
        ports = {building, terrain, ownership}
        dioramas = setupDioramas(scene, ports)
    })

    it('生成结构与子实体归属', () => {
        const entity = dioramas.add(blueprint(), 2, 0, 3)
        expect(entity.diagnostics.length).toBe(0)
        expect(building.getAll().length).toBe(1)
        expect(terrain.getAll().length).toBe(1)
        expect(ownership.entriesOf(entity.dioramaId, () => true).length).toBe(2)
    })

    it('重建替换旧子实体', () => {
        const entity = dioramas.add(blueprint(), 0, 0, 0)
        const oldBuildingId = building.getAll()[0].id
        dioramas.rebuild(entity.id, blueprint())
        expect(building.getAll().some(world => world.id === oldBuildingId)).toBe(false)
        expect(ownership.entriesOf(entity.dioramaId, () => true).length).toBe(2)
    })

    it('删除箱庭级联删除子实体', () => {
        const entity = dioramas.add(blueprint(), 0, 0, 0)
        dioramas.removeCascade(entity.id)
        expect(building.getAll().length).toBe(0)
        expect(terrain.getAll().length).toBe(0)
        expect(ownership.entriesOf(entity.dioramaId, () => true).length).toBe(0)
    })

    it('存档往返恢复箱庭与归属但不重复生成子实体', () => {
        const entity = dioramas.add(blueprint(), 0, 0, 0)
        const systems = new Map<string, EntityInfoSource>([
            ['building_generator', building],
            ['terrain', terrain],
            ['diorama', dioramas],
        ])
        const data = collectWorldState(systems, [terrain], 'edit', undefined, undefined, undefined, ownership)
        expect(data.entities.some(item => item.type === 'diorama')).toBe(true)

        const scene2 = new Scene()
        const shared2 = createSharedWorld()
        const building2 = setupBuildingGenerator(scene2, shared2)
        const terrain2 = setupTerrain(scene2, shared2, () => [])
        const ownership2 = createOwnershipStore()
        const dioramas2 = setupDioramas(scene2, {building: building2, terrain: terrain2, ownership: ownership2})
        const systems2 = new Map<string, EntityInfoSource>([
            ['building_generator', building2],
            ['terrain', terrain2],
            ['diorama', dioramas2],
        ])
        loadWorldFromData(data, systems2, [terrain2], ownership2)

        expect(dioramas2.getAll().length).toBe(1)
        expect(building2.getAll().length).toBe(1)
        expect(terrain2.getAll().length).toBe(1)
        const restored = dioramas2.getAll()[0]
        expect(restored.dioramaId).toBe(entity.dioramaId)
        expect(ownership2.entriesOf(entity.dioramaId, () => true).length).toBe(2)
    })
})
