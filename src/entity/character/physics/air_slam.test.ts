import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld, type SharedWorld} from '../../../physics/world.ts'
import {clearAllForces} from '../../../physics/rapier_utils.ts'
import {FIXED_TIME_STEP} from '../../../physics/constants.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import {createWeaponRuntime} from '../../../character/weapon/weapon_runtime.ts'
import {weaponAttacksOf} from '../../../character/weapon/catalog.ts'
import type {AttackImpulse} from '../../../character/weapon/attack_chain.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

/**
 * 空中砸地冲量时序回归（战锤「跳跃砸地」）：
 * 冲量是**段数据**（`AttackSegment.impulses`），由 `attacking` / `air_attacking` 在段内时间轴到达 `at` 时
 * 对施术者自身施加，与命中窗口（clip `hitbox_on`）同刻；不在状态 `enter`（起手瞬间）施加——
 * 否则角色会在窗口开启前落地、判定扑空。
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

/** 某武器空中段的冲击配置（无则 undefined） */
const airImpulseOf = (weaponId: string, segmentId: string): AttackImpulse | undefined => {
    const weapon = createWeaponRuntime(weaponId).weapon
    if (weapon.type !== 'melee') return undefined
    return weaponAttacksOf(weapon).segments[segmentId]?.impulses?.[0]
}

describe('空中砸地冲量（段内冲击，打击帧施加）', () => {
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
        for (let i = 0; i < 180; i++) {
            frame()
            const p = system.getPlayerCharacter()
            if (p?.isOnGround && p.stateMachine.currentState === 'idle') break
        }
    }

    /** 起跳 + 起手空中攻击 */
    const startAirAttack = (): NonNullable<ReturnType<CharacterEntitySystem['getPlayerCharacter']>> => {
        system.setPlayerMove(0, 0, true, 0, 1)
        frame()
        system.setPlayerMove(0, 0, false, 0, 1)
        frame()
        system.setPlayerAttack('light')
        frame()
        const p = system.getPlayerCharacter()!
        expect(p.stateMachine.currentState).toBe('air_attacking')
        expect(p.combat.activeSegment?.key).toBe('air')
        return p
    }

    it('战锤：起手瞬间不下坠，冲量在段内 0.5s（打击帧）施加', () => {
        const impulse = airImpulseOf('war_hammer', 'war_hammer_one_handed_air_1')
        expect(impulse).toBeDefined()
        const impulseSpeed = impulse?.speed ?? 0
        expect(impulseSpeed).toBeGreaterThan(0)
        spawnPlayer('war_hammer')
        const p = startAirAttack()

        /* 起手瞬间：仍在跳跃惯性中（冲击尚未到点） */
        expect(p.body.linvel().y).toBeGreaterThan(-impulseSpeed)

        /* 逐帧找到冲量帧（下坠冲量把 y 推到 -slamSpeed 附近；自由落体 0.5s 远达不到） */
        let slamFrame = -1
        for (let i = 1; i <= 60; i++) {
            frame()
            if (p.body.linvel().y <= -impulseSpeed * 0.9) {
                slamFrame = i
                break
            }
        }
        /* `at = 0.5s` ≈ 30 帧：既不能是起手（0，旧行为），也不该拖到落地之后 */
        expect(slamFrame).toBeGreaterThanOrEqual(28)
        expect(slamFrame).toBeLessThanOrEqual(33)
    })

    it('无段内冲击的武器：空中攻击全程不下坠', () => {
        expect(airImpulseOf('long_sword', 'long_sword_one_handed_air_1')).toBeUndefined()
        spawnPlayer('long_sword')
        const p = startAirAttack()
        for (let i = 0; i < 60; i++) {
            frame()
            expect(p.body.linvel().y).toBeGreaterThan(-13)
        }
    })
})
