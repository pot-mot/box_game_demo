import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld, type SharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

/** 帧步长（与物理固定步长一致） */
const DT = 1 / 60

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

const meleeSaveConfig = (): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    attack: {weaponId: 'long_sword', damage: 3},
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 15,
    isPlayer: false,
})

/**
 * 角色接触不得被当成地面：对方竖直胶囊的近水平侧面法线一旦进入 groundNormal，
 * 瞬态坡面投影会把水平速度转成垂直速度（翻滚撞人时表现为「跳到对方头顶」），
 * 也会把悬空角色误判为着地而「站在对方身上」。
 */
describe('角色接触不被当作地面', () => {
    let system: CharacterEntitySystem
    let shared: SharedWorld
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
        shared = createSharedWorld()
        system = setupCharacterEntities(new Scene(), shared)
    })

    /** 帧序与 main.ts 一致：物理子步 → 事件排空 → syncPositions → update */
    const step = (): void => {
        shared.world.step(shared.eventQueue)
        shared.eventBus.drain()
        system.syncPositions()
        system.update(DT)
    }

    it('悬空角色落在另一角色身上时判为未着地（法线不取自对方胶囊）', () => {
        /* a 脚底 y=0.5 悬空并落在站立的 b 侧面/顶部，唯一接触是 b 的胶囊 */
        const {id: aId} = system.add(meleeSaveConfig(), 0, 0.5, 0)
        const {id: bId} = system.add(meleeSaveConfig(), 0.2, 0, 0)
        const a = system.getAll().find(e => e.id === aId)!
        void bId

        for (let i = 0; i < 5; i++) {
            step()
            /* a 尚未落到真实地面 → 不得因接触 b 而判为着地，法线保持默认朝上 */
            expect(a.isOnGround).toBe(false)
            expect(a.groundNormal.y).toBeGreaterThan(0.9)
        }
    })

    it('翻滚撞向另一角色不越顶、最终落回地面且保持水平分离', () => {
        const {id: aId} = system.add(meleeSaveConfig(), 0, 0, 0)
        const {id: bId} = system.add(meleeSaveConfig(), 0.4, 0, 0)
        const a = system.getAll().find(e => e.id === aId)!
        const b = system.getAll().find(e => e.id === bId)!

        /* 给翻滚一个朝 +x（朝 b）的初速度，触发翻滚方向解析；b 直立不动 */
        a.body.setLinvel({x: 6, y: 0, z: 0}, true)
        a.stateMachine.setInput(0, 0, false, false, true)

        step()
        expect(a.stateMachine.currentState).toBe('rolling')

        let maxAy = a.body.translation().y
        for (let i = 0; i < 60; i++) {
            step()
            maxAy = Math.max(maxAy, a.body.translation().y)
        }

        const aPos = a.body.translation()
        const bPos = b.body.translation()
        /* 角色总高 1.0（脚底原点），站到对方头顶时 y ≈ 1.0；远低于此即未越顶 */
        expect(maxAy).toBeLessThan(0.9)
        /* 结束后回到地面高度 */
        expect(aPos.y).toBeGreaterThan(0.4)
        expect(aPos.y).toBeLessThan(0.6)
        /* 最终水平分离（半径 0.125 × 2 = 0.25） */
        expect(Math.hypot(aPos.x - bPos.x, aPos.z - bPos.z)).toBeGreaterThanOrEqual(0.2)
        /* 对方未被抬起 */
        expect(bPos.y).toBeLessThan(0.6)
    })
})
