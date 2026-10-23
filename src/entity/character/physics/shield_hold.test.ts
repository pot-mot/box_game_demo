import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld, type SharedWorld} from '../../../physics/world.ts'
import {clearAllForces} from '../../../physics/rapier_utils.ts'
import {FIXED_TIME_STEP} from '../../../physics/constants.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import {humanoidBodyStateOf} from '../body_form/humanoid/state/body_state.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

/**
 * 盾攻击键路由回归：
 * 1. 主手盾短按轻/重击键出招（盾击 / 盾撞）；
 * 2. 主手盾长按超过 holdThreshold 进入 blocking，松手仅落盾不出招；
 * 3. 副手盾由重击键接管：长按格挡、短按无攻击；轻击键仍走主手武器；
 * 4. 无盾时长按不进入 blocking。
 */

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

const saveConfig = (weaponId: string, offhandId?: string): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    equipment: {limb: {}, weapon: {main_hand: weaponId, ...(offhandId !== undefined ? {off_hand: offhandId} : {})}, armor: {}},
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 20,
    isPlayer: true,
})

describe('盾攻击键路由', () => {
    let system: CharacterEntitySystem
    let scene: Scene
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
        scene = new Scene()
        shared = createSharedWorld()
        shared.eventBus.onStepEnd(() => clearAllForces(shared.world))
        system = setupCharacterEntities(scene, shared)
    })

    /** 生产帧序：步进物理 → 排空事件（清力）→ 角色系统更新 */
    const frame = (): void => {
        shared.world.step(shared.eventQueue)
        shared.eventBus.drain()
        system.update(FIXED_TIME_STEP)
    }

    const spawnPlayer = (weaponId: string, offhandId?: string): void => {
        const {id} = system.add(saveConfig(weaponId, offhandId), 0, 0.5, 0)
        system.markPlayer(id)
        system.setPlayerMove(0, 0, false, 0, 1)
        /* 落地稳定：等待接地并脱离 falling（STATE_FLIP_MIN_TIME）后再施加攻击键输入 */
        for (let i = 0; i < 180; i++) {
            frame()
            const p = system.getPlayerCharacter()
            if (p?.isOnGround && p.stateMachine.currentState === 'idle') break
        }
    }

    const player = (): ReturnType<CharacterEntitySystem['getPlayerCharacter']> =>
        system.getPlayerCharacter()

    it('主手盾短按轻击键出招（盾击）', () => {
        spawnPlayer('shield_medium')
        system.beginPlayerAttackHold('light')
        system.endPlayerAttackHold('light', 0.05)
        frame()
        expect(player()!.stateMachine.currentState).toBe('attacking')
        expect(player()!.combat.attackActive).toBe(true)
        expect(player()!.combat.blocking).toBe(false)
    })

    it('主手盾长按轻击键进入格挡，松手仅落盾不出招', () => {
        spawnPlayer('shield_medium')
        system.beginPlayerAttackHold('light')
        for (let i = 0; i < 30; i++) frame()
        expect(player()!.stateMachine.currentState).toBe('blocking')
        expect(player()!.combat.blocking).toBe(true)

        system.endPlayerAttackHold('light', 0.5)
        frame()
        expect(player()!.stateMachine.currentState).not.toBe('blocking')
        expect(player()!.combat.attackActive).toBe(false)
    })

    it('主手盾短按重击键出招（盾撞）', () => {
        spawnPlayer('shield_medium')
        system.beginPlayerAttackHold('heavy')
        system.endPlayerAttackHold('heavy', 0.05)
        frame()
        expect(player()!.stateMachine.currentState).toBe('attacking')
    })

    it('主手盾双键持握：后按盾键被忽略，松开不误出招', () => {
        spawnPlayer('shield_medium')
        system.beginPlayerAttackHold('light')
        for (let i = 0; i < 30; i++) frame()
        expect(player()!.stateMachine.currentState).toBe('blocking')

        /* 已按住轻击键时再按重击键应被忽略（不覆盖持握键） */
        system.beginPlayerAttackHold('heavy')
        /* 松开被忽略的重击键：不应触发攻击，仍保持格挡 */
        system.endPlayerAttackHold('heavy', 0.5)
        frame()
        expect(player()!.combat.attackActive).toBe(false)
        expect(player()!.stateMachine.currentState).toBe('blocking')

        /* 松开真正按住的轻击键：仅落盾，不出招 */
        system.endPlayerAttackHold('light', 0.5)
        frame()
        expect(player()!.combat.attackActive).toBe(false)
        expect(player()!.stateMachine.currentState).not.toBe('blocking')
    })

    it('副手盾长按重击键格挡、短按无攻击', () => {
        spawnPlayer('long_sword', 'shield_small')
        system.beginPlayerAttackHold('heavy')
        for (let i = 0; i < 30; i++) frame()
        expect(player()!.stateMachine.currentState).toBe('blocking')

        system.endPlayerAttackHold('heavy', 0.5)
        frame()
        expect(player()!.combat.attackActive).toBe(false)

        /* 短按重击键：副手盾无攻击能力 */
        system.beginPlayerAttackHold('heavy')
        system.endPlayerAttackHold('heavy', 0.05)
        for (let i = 0; i < 3; i++) frame()
        expect(player()!.combat.attackActive).toBe(false)
        expect(player()!.stateMachine.currentState).not.toBe('attacking')
    })

    it('副手盾时轻击键仍走主手武器攻击', () => {
        spawnPlayer('long_sword', 'shield_small')
        system.beginPlayerAttackHold('light')
        system.endPlayerAttackHold('light', 0.05)
        frame()
        expect(player()!.stateMachine.currentState).toBe('attacking')
    })

    it('无盾时长按不进入格挡', () => {
        spawnPlayer('long_sword')
        system.beginPlayerAttackHold('heavy')
        for (let i = 0; i < 30; i++) frame()
        expect(player()!.stateMachine.currentState).not.toBe('blocking')
    })

    it('副手盾 + 双手共持：盾挂背、格挡来源清除，重击键出招而非格挡', () => {
        spawnPlayer('long_sword', 'shield_small')
        const p = player()!
        /* 单持：副手盾提供格挡 */
        expect(p.combat.block).toBeDefined()

        expect(system.setHoldMode(p.id, 'two_handed')).toBe(true)
        expect(humanoidBodyStateOf(p.bodyState).holdMode).toBe('two_handed')
        /* 副手盾挂背：不再计为可用盾 */
        expect(p.combat.block).toBeUndefined()

        /* 重击键不再被盾接管：长按不得进入格挡 */
        system.beginPlayerAttackHold('heavy')
        for (let i = 0; i < 30; i++) frame()
        expect(p.stateMachine.currentState).not.toBe('blocking')

        /* 切回单持：副手盾回手，格挡恢复 */
        expect(system.setHoldMode(p.id, 'one_handed')).toBe(true)
        expect(p.combat.block).toBeDefined()
    })
})
