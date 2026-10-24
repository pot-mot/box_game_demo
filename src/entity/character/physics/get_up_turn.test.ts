import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene, Vector3} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import type {CharacterEntity} from '../../../character/types.ts'

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

const meleeSaveConfig = (): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    equipment: {limb: {}, weapon: {main_hand: 'long_sword'}, armor: {}},
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: false,
})

const DT = 1 / 60

const forwardOf = (entity: CharacterEntity): Vector3 =>
    new Vector3(0, 0, 1).applyQuaternion(entity.appearanceGroup.quaternion)

describe('起身前翻身（躺地转到正面朝下）', () => {
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
        system = setupCharacterEntities(new Scene(), createSharedWorld())
    })

    it('后倒（仰面）→ 起身前 0.25s 翻身到俯卧，再爬起并保持新面朝', () => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(candidate => candidate.state.identity.id === id)!
        /* 默认向后倒：面朝 +Z，倒向 -Z（仰面），起身前需水平转 180° */
        entity.state.combat.pendingKnockdown = true
        for (let i = 0; i < 120 && entity.stateMachine.currentState !== 'getting_up'; i++) system.update(DT)
        expect(entity.stateMachine.currentState).toBe('getting_up')
        expect(entity.state.combat.getUpTurnDuration).toBeCloseTo(0.25, 6)

        /* 翻身过程中：身体仍伏地，前方向从朝上转向地面 */
        while (entity.stateMachine.stateTime < 0.1) system.update(DT)
        expect(entity.state.timers.knockdownFallAngle).toBeCloseTo(Math.PI / 2, 6)
        expect(forwardOf(entity).y).toBeGreaterThan(0)

        /* 翻身结束：正面朝下（前方向 -Y≈-1） */
        while (entity.stateMachine.stateTime < entity.state.combat.getUpTurnDuration + DT) system.update(DT)
        expect(entity.state.timers.knockdownFallAngle).toBeGreaterThan(Math.PI / 2 - 0.05)
        expect(forwardOf(entity).y).toBeLessThan(-0.9)

        /* 爬起结束：站直且保持翻身后的面朝（+Z → -Z） */
        for (let i = 0; i < 300 && entity.stateMachine.currentState === 'getting_up'; i++) system.update(DT)
        expect(entity.stateMachine.currentState).not.toBe('getting_up')
        expect(entity.state.timers.knockdownFallAngle).toBe(0)
        expect(forwardOf(entity).z).toBeLessThan(-0.9)
    })
})

