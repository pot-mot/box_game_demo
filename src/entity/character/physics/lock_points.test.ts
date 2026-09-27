import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import {collectWorldState} from '../../../save_load/serialize.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import type {EntityInfoSource} from '../../box/base/types/entity_info.ts'

/** happy-dom 不支持 canvas 2d，注入最小 2d 上下文桩 */
const canvasCtxStub = (): Record<string, unknown> => ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    fillRect: () => {},
    beginPath: () => {},
    fill: () => {},
    stroke: () => {},
    arc: () => {},
    ellipse: () => {},
})

const originalGetContext = HTMLCanvasElement.prototype.getContext

const patchCanvas2d = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: () => canvasCtxStub(),
        configurable: true,
        writable: true,
    })
}

const restoreCanvas2d = (): void => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: originalGetContext,
        configurable: true,
        writable: true,
    })
}

const meleeSaveConfig = (overrides?: Partial<CharacterSaveConfig>): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    attack: {
        weaponId: 'long_sword',
        damage: 3,
    },
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: false,
    ...overrides,
})

describe('角色额外锁定点', () => {
    let system: CharacterEntitySystem
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeAll(async () => {
        await RAPIER.init()
        patchCanvas2d()
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterAll(() => {
        restoreCanvas2d()
        warnSpy.mockRestore()
    })

    beforeEach(() => {
        const scene = new Scene()
        const shared = createSharedWorld()
        system = setupCharacterEntities(scene, shared)
    })

    it('add 按存档写入额外锁定点，旧档缺字段回退空数组', () => {
        const withPoints = system.add({...meleeSaveConfig(), lockPoints: [{jointId: 'headNeck', offset: [0, 0.2, 0]}]}, 0, 0, 0)
        expect(system.getAll().find(e => e.id === withPoints.id)!.lockPoints).toEqual([{jointId: 'headNeck', offset: [0, 0.2, 0]}])

        const withoutPoints = system.add(meleeSaveConfig(), 1, 0, 0)
        expect(system.getAll().find(e => e.id === withoutPoints.id)!.lockPoints).toEqual([])
    })

    it('序列化保留锁定点（JSON-safe 元组），setLockPoints 过滤非法条目', () => {
        const {id} = system.add({...meleeSaveConfig(), lockPoints: [{jointId: 'headNeck', offset: [0, 0.2, 0]}]}, 0, 0, 0)
        const systems = new Map<string, EntityInfoSource>([['character', system]])
        const state = collectWorldState(systems, [], 'edit')
        const saved = state.entities.find(e => e.type === 'character')
        if (saved?.type === 'character') {
            expect(saved.config.lockPoints).toEqual([{jointId: 'headNeck', offset: [0, 0.2, 0]}])
        }

        system.setLockPoints(id, [
            {jointId: '', offset: [0, 0, 0]},
            {jointId: 'spine', offset: [Number.NaN, 0, 0]},
            {jointId: 'spine', offset: [0, 0.1, 0]},
        ])
        expect(system.getAll().find(e => e.id === id)!.lockPoints).toEqual([{jointId: 'spine', offset: [0, 0.1, 0]}])
    })
})
