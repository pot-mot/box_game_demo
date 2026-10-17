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

describe('角色行为原点策略存档', () => {
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

    it('add 写入原点策略 / 漫游间隔 / 追击半径；旧档缺字段回退默认', () => {
        const custom = system.add({
            ...meleeSaveConfig(),
            originStrategy: 'roamer',
            originInterval: 12,
            chaseLeashRadius: 30,
        }, 0, 0, 0)
        const e = system.getAll().find(c => c.id === custom.id)!
        expect(e.originStrategy).toBe('roamer')
        expect(e.originInterval).toBe(12)
        expect(e.chaseLeashRadius).toBe(30)

        const legacy = system.add(meleeSaveConfig(), 1, 0, 0)
        const l = system.getAll().find(c => c.id === legacy.id)!
        expect(l.originStrategy).toBe('resident')
        expect(l.originInterval).toBe(20)
        expect(l.chaseLeashRadius).toBe(20)
    })

    it('setChaseLeashRadius / setOriginInterval / setOriginStrategy 更新实体字段', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.setChaseLeashRadius(id, 8)
        system.setOriginInterval(id, 15)
        system.setOriginStrategy(id, 'hunter')
        const e = system.getAll().find(c => c.id === id)!
        expect(e.chaseLeashRadius).toBe(8)
        expect(e.originInterval).toBe(15)
        expect(e.originStrategy).toBe('hunter')
    })

    it('序列化写出三个字段（往返保留）', () => {
        system.add({
            ...meleeSaveConfig(),
            originStrategy: 'fighter',
            originInterval: 7,
            chaseLeashRadius: 25,
        }, 0, 0, 0)
        const systems = new Map<string, EntityInfoSource>([['character', system]])
        const state = collectWorldState(systems, [], 'edit')
        const saved = state.entities.find(e => e.type === 'character')
        expect(saved?.type).toBe('character')
        if (saved?.type === 'character') {
            expect(saved.config.originStrategy).toBe('fighter')
            expect(saved.config.originInterval).toBe(7)
            expect(saved.config.chaseLeashRadius).toBe(25)
        }
    })
})
