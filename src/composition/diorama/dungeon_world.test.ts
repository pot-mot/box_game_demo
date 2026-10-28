import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../physics/world.ts'
import {createPhysicsEnv} from '../../physics/env.ts'
import {createVelocitySnapshots} from '../../physics/velocity_snapshots.ts'
import {setupBuildingGenerator} from '../../entity/building_generator/world.ts'
import {setupTerrain} from '../../entity/terrain/common/physics/world.ts'
import {setupInteractables} from '../../entity/interactable/index.ts'
import {setupItemEntities} from '../../entity/item/index.ts'
import {setupBoxes} from '../../entity/box/physics/world.ts'
import {setupAreas} from '../../entity/area/physics/world.ts'
import {setupFragmentEntities} from '../../entity/fragment/common/physics/world.ts'
import {createOwnershipStore} from '../../types/ownership_store.ts'
import {setupDioramas} from './world.ts'
import {createDungeonBlueprint} from './recipes/dungeon.ts'

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

describe('地下城箱庭生成', () => {
    it('经全部端口生成建筑、门闸、升降梯与开关', () => {
        const scene = new Scene()
        const shared = createSharedWorld()
        const physicsEnv = createPhysicsEnv()
        const velocitySnapshots = createVelocitySnapshots(shared.eventBus, () => physicsEnv.getAllBodies())
        const fragments = setupFragmentEntities(scene, shared)
        const terrain = setupTerrain(scene, shared, () => physicsEnv.getAllBodies())
        const building = setupBuildingGenerator(scene, shared)
        const interactables = setupInteractables(scene, shared)
        const items = setupItemEntities(scene, shared)
        const areas = setupAreas(scene, physicsEnv)
        const boxes = setupBoxes(scene, shared, {fragmentCtx: fragments, velocitySnapshots, physicsEnv})
        const ownership = createOwnershipStore()
        const dioramas = setupDioramas(scene, {
            building, ownership, terrain, area: areas, box: boxes,
            interactable: interactables, item: items,
        })

        const blueprint = createDungeonBlueprint(42)
        const entity = dioramas.add(blueprint, 0, 0, 0)
        expect(entity.diagnostics.filter(item => item.severity === 'error')).toEqual([])
        expect(building.getAll().length).toBe(1)
        expect(building.getAll()[0].chunks.size).toBeGreaterThan(0)
        expect(interactables.getAll().length).toBeGreaterThan(0)
        expect(interactables.getAll().some(e => e.config.kind === 'push_door_single' || e.config.kind === 'push_door_double')).toBe(true)
        expect(boxes.getAll().length).toBeGreaterThan(0)
        expect(ownership.entriesOf(entity.dioramaId, () => true).length).toBeGreaterThan(0)
    })
})
