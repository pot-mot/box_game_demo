import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../physics/world.ts'
import {collectWorldState} from '../../save_load/serialize.ts'
import {loadWorldFromData} from '../../save_load/deserialize.ts'
import {createOwnershipStore} from '../../types/ownership_store.ts'
import type {EntityInfoSource} from '../box/base/types/entity_info.ts'
import {setupSlopeBlocks} from './physics/world.ts'
import {DEFAULT_SLOPE_BLOCK_CONFIG} from './validation.ts'

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

describe('预制斜面块', () => {
    it('几何为整数边长三角柱，配置更新后重建', () => {
        const ctx = setupSlopeBlocks(new Scene(), createSharedWorld())
        const entity = ctx.add(DEFAULT_SLOPE_BLOCK_CONFIG, 1, 2, 3)
        const box = entity.mesh.geometry.boundingBox
        expect(box).not.toBeNull()
        expect(box!.max.x - box!.min.x).toBeCloseTo(DEFAULT_SLOPE_BLOCK_CONFIG.size)
        expect(box!.max.y - box!.min.y).toBeCloseTo(DEFAULT_SLOPE_BLOCK_CONFIG.size)
        expect(box!.max.z - box!.min.z).toBeCloseTo(DEFAULT_SLOPE_BLOCK_CONFIG.size)

        ctx.updateConfig(entity.id, {...DEFAULT_SLOPE_BLOCK_CONFIG, size: 4, axis: 'z'})
        const next = entity.mesh.geometry.boundingBox
        expect(next!.max.x - next!.min.x).toBeCloseTo(4)
        expect(next!.max.z - next!.min.z).toBeCloseTo(4)
    })

    it('存档往返保留配置与变换', () => {
        const ctx = setupSlopeBlocks(new Scene(), createSharedWorld())
        const ownership = createOwnershipStore()
        const entity = ctx.add({size: 2, axis: 'z', material: 'brick'}, 2, 1, 4)
        ctx.setTransform(entity.id, {x: 2, y: 1, z: 4}, {x: 0, y: 90, z: 0})
        ownership.set({type: 'slope_block', runtimeId: entity.id}, {dioramaId: 'd1', nodeId: 'n1'})
        const systems = new Map<string, EntityInfoSource>([['slope_block', ctx]])
        const data = collectWorldState(systems, [], 'edit', undefined, undefined, undefined, ownership)
        expect(data.entities.some(item => item.type === 'slope_block')).toBe(true)

        const ctx2 = setupSlopeBlocks(new Scene(), createSharedWorld())
        const ownership2 = createOwnershipStore()
        const systems2 = new Map<string, EntityInfoSource>([['slope_block', ctx2]])
        loadWorldFromData(data, systems2, [], ownership2)
        const restored = ctx2.getAll()[0]
        expect(restored.config).toEqual({size: 2, axis: 'z', material: 'brick'})
        expect(restored.mesh.position.x).toBeCloseTo(2)
        expect(restored.mesh.position.z).toBeCloseTo(4)
        expect(ownership2.get({type: 'slope_block', runtimeId: restored.id})).toEqual({dioramaId: 'd1', nodeId: 'n1'})
    })
})
