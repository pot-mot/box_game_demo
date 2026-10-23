import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld, type SharedWorld} from '../../../physics/world.ts'
import {clearAllForces} from '../../../physics/rapier_utils.ts'
import {FIXED_TIME_STEP} from '../../../physics/constants.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

/**
 * 攻击键保持（蓄力）/ 连段预输入路由回归：
 * 1. **蓄力一旦松开即结束蓄力**：动作阶段再按住不冻结、不续蓄（`chargeCommitted`），不会「一段一段增长」；
 * 2. **预输入只在后摇窗口接受**：抬手 / 挥斩等出招阶段的按键被忽略，后摇按键才在段末推进下一段。
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

const saveConfig = (weaponId: string): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    equipment: {limb: {}, weapon: {main_hand: weaponId}, armor: {}},
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 20,
    isPlayer: true,
})

describe('攻击键保持 / 连段预输入路由', () => {
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

    const spawnPlayer = (weaponId: string): void => {
        const {id} = system.add(saveConfig(weaponId), 0, 0.5, 0)
        system.markPlayer(id)
        system.setPlayerMove(0, 0, false, 0, 1)
        /* 落地稳定：等待接地并脱离 falling 后再施加攻击键输入 */
        for (let i = 0; i < 180; i++) {
            frame()
            const p = system.getPlayerCharacter()
            if (p?.isOnGround && p.stateMachine.currentState === 'idle') break
        }
    }

    const player = (): NonNullable<ReturnType<CharacterEntitySystem['getPlayerCharacter']>> =>
        system.getPlayerCharacter()!

    it('蓄力松开即结束蓄力：动作阶段再按住不再冻结 / 续蓄', () => {
        spawnPlayer('long_sword')
        system.beginPlayerAttackHold('heavy')
        for (let i = 0; i < 20; i++) frame()
        const p = player()
        expect(p.combat.attackHolding).toBe(true)
        const charge = p.combat.attackCharge
        expect(charge).toBeGreaterThan(0.2)

        /* 松开：结束蓄力（置位 chargeCommitted），从已蓄力进度继续出招 */
        system.endPlayerAttackHold('heavy', 0.4)
        frame()
        expect(p.combat.chargeCommitted).toBe(true)
        expect(p.combat.attackHolding).toBe(false)

        /* 动作阶段（抬手 / 挥斩）再按住：不冻结、蓄力值不变（不会一段段增长） */
        system.beginPlayerAttackHold('heavy')
        for (let i = 0; i < 10; i++) frame()
        expect(p.combat.attackHolding).toBe(false)
        expect(p.combat.attackCharge).toBeCloseTo(charge, 6)
    })

    it('预输入只在后摇窗口接受：抬手阶段按键被忽略（不连段，收招回 idle）', () => {
        spawnPlayer('long_sword')
        system.setPlayerAttack('light')
        frame()
        const p = player()
        expect(p.combat.activeSegment?.id).toBe('long_sword_one_handed_light_1')

        /* 抬手阶段按下轻击键：不写缓冲 */
        system.beginPlayerAttackHold('light')
        system.endPlayerAttackHold('light', 0.05)
        frame()
        expect(p.combat.bufferedSegment).toBeUndefined()

        /* 无缓冲：轻 1 完整播完（1.1s）后收招回 idle */
        for (let i = 0; i < 90 && p.stateMachine.currentState === 'attacking'; i++) frame()
        expect(p.stateMachine.currentState).toBe('idle')
    })

    it('预输入在后摇窗口接受：后摇按下轻击键 → 段末连到轻 2', () => {
        spawnPlayer('long_sword')
        system.setPlayerAttack('light')
        frame()
        const p = player()
        expect(p.combat.activeSegment?.id).toBe('long_sword_one_handed_light_1')

        /* 推进到后摇（动作 0.6s ≈ 36 帧） */
        for (let i = 0; i < 45 && p.combat.phaseIndex < 2; i++) frame()
        expect(p.combat.phaseIndex).toBe(2)

        system.beginPlayerAttackHold('light')
        system.endPlayerAttackHold('light', 0.05)
        frame()
        expect(p.combat.bufferedSegment?.id).toBe('long_sword_one_handed_light_2')

        for (let i = 0; i < 60 && p.combat.activeSegment?.id !== 'long_sword_one_handed_light_2'; i++) frame()
        expect(p.combat.activeSegment?.id).toBe('long_sword_one_handed_light_2')
    })

    it('蓄力重击释放后在后摇按下重击键：连到重击 2（不续蓄、不再瞬间完成）', () => {
        spawnPlayer('long_sword')
        system.beginPlayerAttackHold('heavy')
        for (let i = 0; i < 20; i++) frame()
        const p = player()
        expect(p.combat.attackHolding).toBe(true)
        system.endPlayerAttackHold('heavy', 0.4)

        /* 从已蓄力进度推进到后摇 */
        for (let i = 0; i < 70 && p.combat.phaseIndex < 2; i++) frame()
        expect(p.combat.phaseIndex).toBe(2)

        system.beginPlayerAttackHold('heavy')
        system.endPlayerAttackHold('heavy', 0.05)
        frame()
        expect(p.combat.bufferedSegment?.id).toBe('long_sword_one_handed_heavy_2')

        for (let i = 0; i < 90 && p.combat.activeSegment?.id !== 'long_sword_one_handed_heavy_2'; i++) frame()
        expect(p.combat.activeSegment?.id).toBe('long_sword_one_handed_heavy_2')
        /* 新段入场：结束蓄力标记清零 */
        expect(p.combat.chargeCommitted).toBe(false)
    })
})
