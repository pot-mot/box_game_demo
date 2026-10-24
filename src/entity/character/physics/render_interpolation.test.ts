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

const saveConfig = (): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {}},
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: false,
})

describe('角色渲染插值（滞后一拍）', () => {
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
        system = setupCharacterEntities(scene, createSharedWorld())
    })

    it('物理步末捕获、渲染帧按 alpha 在上一 / 当前状态之间插值', () => {
        const {id} = system.add(saveConfig(), 0, 1, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)
        expect(entity).toBeDefined()
        if (entity === undefined) return

        const start = entity.body.translation()
        system.syncTrueTransforms()
        system.captureRenderState()

        /* 下一个物理步：移动 0.4m（低于传送吸附阈值） */
        entity.body.setTranslation({x: start.x + 0.4, y: start.y, z: start.z}, true)
        system.syncTrueTransforms()
        system.captureRenderState()

        system.syncPositions(0)
        expect(entity.mesh.position.x).toBeCloseTo(start.x, 6)
        expect(entity.appearanceGroup.position.x).toBeCloseTo(start.x, 6)

        system.syncPositions(0.5)
        expect(entity.mesh.position.x).toBeCloseTo(start.x + 0.2, 6)
        expect(entity.appearanceGroup.position.x).toBeCloseTo(start.x + 0.2, 6)

        system.syncPositions(1)
        expect(entity.mesh.position.x).toBeCloseTo(start.x + 0.4, 6)
    })

    it('resetRenderState 后不从上一次位置插值滑行', () => {
        const {id} = system.add(saveConfig(), 0, 1, 0)
        const entity = system.getAll().find(e => e.state.identity.id === id)
        expect(entity).toBeDefined()
        if (entity === undefined) return

        const start = entity.body.translation()
        system.syncTrueTransforms()
        system.captureRenderState()

        entity.body.setTranslation({x: start.x + 5, y: start.y, z: start.z}, true)
        system.syncTrueTransforms()
        system.resetRenderState(id)

        system.syncPositions(0)
        expect(entity.mesh.position.x).toBeCloseTo(start.x + 5, 6)
    })
})
