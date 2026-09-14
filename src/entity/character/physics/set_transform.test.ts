import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

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
    attackSlot: {
        type: 'melee',
        weaponId: 'long_sword',
        damage: 3,
        cooldown: 0.5,
        duration: 0.3,
    },
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: false,
    ...overrides,
})

describe('角色 setTransform 瞬移与朝向映射', () => {
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

    it('setTransform 将 rotDeg.y 映射为角色朝向（getFacing 度数归一）', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.setTransform(id, {x: 1, y: 2, z: 3}, {x: 0, y: 90, z: 0})
        expect(system.getFacing(id)).toBeCloseTo(90, 6)
        const entity = system.getAll().find(e => e.id === id)
        expect(entity).toBeDefined()
        /* mesh 只绕 Y 轴旋转（角色竖直胶囊锁定旋转） */
        expect(entity!.mesh.rotation.y).toBeCloseTo(Math.PI / 2, 6)
        expect(entity!.mesh.rotation.x).toBeCloseTo(0, 6)
        expect(entity!.mesh.rotation.z).toBeCloseTo(0, 6)
        /* 位置同步 */
        expect(entity!.mesh.position.x).toBeCloseTo(1, 6)
        expect(entity!.mesh.position.y).toBeCloseTo(2, 6)
        expect(entity!.mesh.position.z).toBeCloseTo(3, 6)
    })

    it('setTransform 保留 X/Z 倾斜（仅 Y 映射朝向，视觉倾斜不清零）', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.setTransform(id, {x: 0, y: 0, z: 0}, {x: 15, y: 90, z: -10})
        const entity = system.getAll().find(e => e.id === id)
        expect(entity).toBeDefined()
        /* 朝向只取 Y；X/Z 原样写入 mesh 旋转 */
        expect(system.getFacing(id)).toBeCloseTo(90, 6)
        expect(entity!.mesh.rotation.x).toBeCloseTo(15 * Math.PI / 180, 6)
        expect(entity!.mesh.rotation.y).toBeCloseTo(Math.PI / 2, 6)
        expect(entity!.mesh.rotation.z).toBeCloseTo(-10 * Math.PI / 180, 6)
    })

    it('setTransform 负角度与超过 360° 的角度归一化', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        system.setTransform(id, {x: 0, y: 0, z: 0}, {x: 0, y: -90, z: 0})
        expect(system.getFacing(id)).toBeCloseTo(270, 6)
        system.setTransform(id, {x: 0, y: 0, z: 0}, {x: 0, y: 450, z: 0})
        expect(system.getFacing(id)).toBeCloseTo(90, 6)
    })

    it('setTransform 对不存在的 id 无副作用', () => {
        system.setTransform(999, {x: 0, y: 0, z: 0}, {x: 0, y: 45, z: 0})
        expect(system.getAll()).toHaveLength(0)
    })
})
