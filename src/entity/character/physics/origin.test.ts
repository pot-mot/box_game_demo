import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene, Box3} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'
import {SAVE_FORMAT_VERSION, type CharacterSaveConfig, type SaveData, type SavableCharacter} from '../../../save_load/types.ts'
import {loadWorldFromData} from '../../../save_load/deserialize.ts'
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

describe('角色原点在脚底（非身体中心）', () => {
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

    it('add 的 y 为脚底：mesh/外观定位原点，物理刚体中心上移半高', () => {
        const {id} = system.add(meleeSaveConfig(), 1, 2, 3)
        const entity = system.getAll().find(e => e.id === id)
        expect(entity).toBeDefined()
        const halfH = CHARACTER_BASE_SIZE.height * entity!.config.scale / 2
        expect(entity!.mesh.position.x).toBeCloseTo(1, 6)
        expect(entity!.mesh.position.y).toBeCloseTo(2, 6)
        expect(entity!.mesh.position.z).toBeCloseTo(3, 6)
        expect(entity!.appearanceGroup.position.y).toBeCloseTo(2, 6)
        expect(entity!.body.translation().y).toBeCloseTo(2 + halfH, 6)
    })

    it('胶囊几何体原点在底部：包围盒 min.y = 0，max.y = 高 × scale', () => {
        const {id} = system.add(meleeSaveConfig({scale: 2}), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)
        expect(entity).toBeDefined()
        const bounds = new Box3().setFromObject(entity!.mesh)
        expect(bounds.min.y).toBeCloseTo(0, 5)
        expect(bounds.max.y).toBeCloseTo(CHARACTER_BASE_SIZE.height * 2, 5)
    })

    it('syncPositions 按物理中心回退半高写回脚底原点', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        /* 模拟物理移动：身体中心到 (5, 10, -2)（scale 1 → 半高 0.5） */
        system.setTransform(id, {x: 5, y: 9.5, z: -2}, {x: 0, y: 0, z: 0})
        system.syncPositions()
        const entity = system.getAll().find(e => e.id === id)!
        expect(entity.mesh.position.y).toBeCloseTo(9.5, 6)
        expect(entity.appearanceGroup.position.y).toBeCloseTo(9.5, 6)
        expect(entity.body.translation().y).toBeCloseTo(10, 6)
    })

    it('scale 变更后暂停态脚底锚定：原点不动、物理中心随新半高上移', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(e => e.id === id)!
        const originBefore = entity.mesh.position.y
        system.updateCharacterConfig(id, {scale: 2})
        expect(entity.mesh.position.y).toBeCloseTo(originBefore, 6)
        expect(entity.appearanceGroup.position.y).toBeCloseTo(originBefore, 6)
        /* 脚底锚定：新半高 = 1，物理中心从 0.5 上移到 1 */
        expect(entity.body.translation().y).toBeCloseTo(originBefore + CHARACTER_BASE_SIZE.height * 2 / 2, 6)
    })

    it('v1 旧档（position = 身体中心）加载时迁移为脚底原点', () => {
        const systems = new Map<string, EntityInfoSource>([['character', system]])
        const legacyEntity: SavableCharacter = {
            type: 'character',
            config: meleeSaveConfig(),
            health: 15,
            position: [1, 2, 3],
            quaternion: [0, 0, 0, 1],
        }
        const legacy: SaveData = {entities: [legacyEntity]}
        loadWorldFromData(legacy, systems, [])
        const entity = system.getAll()[0]
        expect(entity.mesh.position.y).toBeCloseTo(2 - CHARACTER_BASE_SIZE.height / 2, 6)
        expect(entity.body.translation().y).toBeCloseTo(2, 6)
    })

    it('当前版本新档（position = 脚底）加载不再迁移', () => {
        const systems = new Map<string, EntityInfoSource>([['character', system]])
        const currentEntity: SavableCharacter = {
            type: 'character',
            config: meleeSaveConfig(),
            health: 15,
            position: [1, 2, 3],
            quaternion: [0, 0, 0, 1],
        }
        const current: SaveData = {version: SAVE_FORMAT_VERSION, entities: [currentEntity]}
        loadWorldFromData(current, systems, [])
        const entity = system.getAll()[0]
        expect(entity.mesh.position.y).toBeCloseTo(2, 6)
        expect(entity.body.translation().y).toBeCloseTo(2 + CHARACTER_BASE_SIZE.height / 2, 6)
    })
})
