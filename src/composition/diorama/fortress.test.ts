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
import {createFortressBlueprint} from './recipes/fortress.ts'
import {collectWorldState} from '../../save_load/serialize.ts'
import {loadWorldFromData} from '../../save_load/deserialize.ts'
import {parseDioramaBlueprintJson} from '../../save_load/validation.ts'
import {DIORAMA_BLUEPRINT_VERSION} from './types.ts'
import type {EntityInfoSource} from '../../entity/box/base/types/entity_info.ts'

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

describe('要塞庭院示例配方', () => {
    it('经全部实体端口生成结构、小物件与归属', () => {
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

        const entity = dioramas.add(createFortressBlueprint(42), 0, 0, 0)
        expect(entity.diagnostics.filter(item => item.severity === 'error')).toEqual([])
        expect(building.getAll().length).toBe(2)
        expect(terrain.getAll().length).toBe(1)
        expect(boxes.getAll().length).toBe(5)
        expect(items.getAll().length).toBe(3)
        expect(interactables.getAll().length).toBe(1)
        expect(building.getAll().some(world => world.props.length === 1)).toBe(true)
        expect(ownership.entriesOf(entity.dioramaId, () => true).length).toBe(12)

        const oldBuildingIds = building.getAll().map(world => world.id)
        const oldBoxIds = boxes.getAll().map(box => box.id)
        dioramas.rebuild(entity.id, createFortressBlueprint(42))
        expect(building.getAll().some(world => oldBuildingIds.includes(world.id))).toBe(false)
        expect(boxes.getAll().some(box => oldBoxIds.includes(box.id))).toBe(false)
        expect(building.getAll().length).toBe(2)
        expect(boxes.getAll().length).toBe(5)
        expect(items.getAll().length).toBe(3)
        expect(interactables.getAll().length).toBe(1)
        expect(ownership.entriesOf(entity.dioramaId, () => true).length).toBe(12)

        dioramas.rebuild(entity.id, createFortressBlueprint(9))
        expect(building.getAll().length).toBe(2)
        expect(boxes.getAll().length).toBe(5)
        expect(items.getAll().length).toBe(3)
        expect(interactables.getAll().length).toBe(1)
        expect(ownership.entriesOf(entity.dioramaId, () => true).length).toBe(12)
    })

    it('面板重建按钮清空旧子实体', () => {
        document.body.innerHTML = ''
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
        }, {parseBlueprint: parseDioramaBlueprintJson})
        const entity = dioramas.add(createFortressBlueprint(42), 0, 0, 0)
        dioramas.select(entity.id)
        const container = document.createElement('div')
        document.body.appendChild(container)
        dioramas.panel.render(container)
        dioramas.panel.update?.()

        const seedInput = document.querySelector<HTMLInputElement>('#diorama-seed')
        expect(seedInput).not.toBeNull()
        seedInput!.value = '99'
        seedInput!.dispatchEvent(new Event('input'))
        /* 失焦后下一帧刷新不得覆盖用户输入 */
        dioramas.panel.update?.()
        expect(seedInput!.value).toBe('99')

        const oldBuildingIds = building.getAll().map(world => world.id)
        const oldBoxIds = boxes.getAll().map(box => box.id)
        const button = document.querySelector<HTMLButtonElement>('#diorama-rebuild')
        expect(button).not.toBeNull()
        button!.click()
        expect(dioramas.getById(entity.id)?.blueprint.seed).toBe(99)
        expect(building.getAll().map(world => world.config.seed).sort()).toEqual([100, 101])
        expect(building.getAll().some(world => oldBuildingIds.includes(world.id))).toBe(false)
        expect(boxes.getAll().some(box => oldBoxIds.includes(box.id))).toBe(false)
        expect(building.getAll().length).toBe(2)
        expect(boxes.getAll().length).toBe(5)
        expect(items.getAll().length).toBe(3)
        expect(interactables.getAll().length).toBe(1)

        /* GUI：添加箱子规则并应用 */
        const ruleRowsBefore = document.querySelectorAll('[data-rule-index]').length
        document.querySelector<HTMLButtonElement>('#diorama-add-box')!.click()
        expect(document.querySelectorAll('[data-rule-index]').length).toBe(ruleRowsBefore + 1)
        document.querySelector<HTMLButtonElement>('#diorama-apply-draft')!.click()
        expect(boxes.getAll().length).toBe(6)

        /* 高级节点编辑：JSON 替换蓝图后重建，旧产物清零 */
        const jsonBlueprint = {
            version: DIORAMA_BLUEPRINT_VERSION,
            recipeId: 'test',
            seed: 1,
            nodes: [{
                kind: 'building',
                nodeId: 'platform',
                position: [0, 0, 0],
                yawQuarter: 0,
                config: {recipe: 'platform', seed: 1, sizeX: 4, sizeY: 1, sizeZ: 4},
            }],
            population: [],
        }
        const textarea = document.querySelector<HTMLTextAreaElement>('#diorama-blueprint-json')
        expect(textarea).not.toBeNull()
        textarea!.value = JSON.stringify(jsonBlueprint)
        textarea!.dispatchEvent(new Event('input'))
        dioramas.panel.update?.()
        expect(textarea!.value).toBe(JSON.stringify(jsonBlueprint))
        document.querySelector<HTMLButtonElement>('#diorama-apply-json')!.click()
        expect(building.getAll().length).toBe(1)
        expect(boxes.getAll().length).toBe(0)
        expect(items.getAll().length).toBe(0)
        expect(interactables.getAll().length).toBe(0)
        expect(terrain.getAll().length).toBe(0)
    })

    it('读档后重建仍清空旧子实体', () => {
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
        const entity = dioramas.add(createFortressBlueprint(7), 0, 0, 0)

        const systems = new Map<string, EntityInfoSource>([
            ['box', boxes], ['area', areas], ['terrain', terrain], ['building_generator', building],
            ['interactable', interactables], ['item', items], ['diorama', dioramas],
        ])
        const data = collectWorldState(systems, [terrain], 'edit', undefined, undefined, undefined, ownership)

        const scene2 = new Scene()
        const shared2 = createSharedWorld()
        const physicsEnv2 = createPhysicsEnv()
        const velocitySnapshots2 = createVelocitySnapshots(shared2.eventBus, () => physicsEnv2.getAllBodies())
        const fragments2 = setupFragmentEntities(scene2, shared2)
        const terrain2 = setupTerrain(scene2, shared2, () => physicsEnv2.getAllBodies())
        const building2 = setupBuildingGenerator(scene2, shared2)
        const interactables2 = setupInteractables(scene2, shared2)
        const items2 = setupItemEntities(scene2, shared2)
        const areas2 = setupAreas(scene2, physicsEnv2)
        const boxes2 = setupBoxes(scene2, shared2, {fragmentCtx: fragments2, velocitySnapshots: velocitySnapshots2, physicsEnv: physicsEnv2})
        const ownership2 = createOwnershipStore()
        const dioramas2 = setupDioramas(scene2, {
            building: building2, ownership: ownership2, terrain: terrain2, area: areas2, box: boxes2,
            interactable: interactables2, item: items2,
        })
        const systems2 = new Map<string, EntityInfoSource>([
            ['box', boxes2], ['area', areas2], ['terrain', terrain2], ['building_generator', building2],
            ['interactable', interactables2], ['item', items2], ['diorama', dioramas2],
        ])
        loadWorldFromData(data, systems2, [terrain2], ownership2)
        const restored = dioramas2.getAll()[0]
        expect(restored.dioramaId).toBe(entity.dioramaId)
        expect(ownership2.entriesOf(restored.dioramaId, () => true).length).toBe(12)

        const oldBuildingIds = building2.getAll().map(world => world.id)
        const oldBoxIds = boxes2.getAll().map(box => box.id)
        dioramas2.rebuild(restored.id, createFortressBlueprint(8))
        expect(building2.getAll().some(world => oldBuildingIds.includes(world.id))).toBe(false)
        expect(boxes2.getAll().some(box => oldBoxIds.includes(box.id))).toBe(false)
        expect(boxes2.getAll().length).toBe(5)
        expect(ownership2.entriesOf(restored.dioramaId, () => true).length).toBe(12)
    })
})
