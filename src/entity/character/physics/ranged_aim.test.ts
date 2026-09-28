import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld, type SharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import {FIXED_TIME_STEP} from '../../../physics/constants.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

/**
 * 远程瞄准 / 弹道朝向回归：
 * 1. 玩家远程攻击期间角色转向「瞄准方向」（相机前方），而不是保持原朝向；
 * 2. 弹丸初始方向取武器实际朝向（muzzleDir），而不是起手瞄准方向——背身开火时子弹不会凭空飞向目标。
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

/** 子弹是世界中唯一的 sensor 碰撞体（与 clear_bullets.test.ts 同法识别） */
const findBulletBody = (shared: SharedWorld): RAPIER.RigidBody | undefined => {
    let found: RAPIER.RigidBody | undefined
    shared.world.bodies.forEach((body) => {
        for (let i = 0; i < body.numColliders(); i++) {
            if (body.collider(i).isSensor()) found = body
        }
    })
    return found
}

const rangedSaveConfig = (weaponId: string): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    attack: {
        weaponId,
        damage: 2,
        ranged: {
            range: 10,
            bulletSpeed: 20,
            bulletKnockback: 3,
            bulletLifetime: 3,
        },
    },
    tendency: {tendencyId: 'hostileExceptSelf'},
    faction: 0,
    maxHealth: 20,
    isPlayer: true,
})

describe('远程瞄准与弹道朝向', () => {
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
        system = setupCharacterEntities(scene, shared)
    })

    it('玩家远程攻击期间转向瞄准方向（相机前方 +X → 朝向 90°）', () => {
        const {id} = system.add(rangedSaveConfig('longbow'), 0, 0, 0)
        system.markPlayer(id)
        /* 相机前方 = +X，角色初始朝向 = +Z */
        system.setPlayerMove(0, 0, false, 1, 0)
        system.setPlayerAttack('light')

        for (let i = 0; i < 30; i++) system.update(FIXED_TIME_STEP)

        expect(system.getFacing(id)).toBeGreaterThan(85)
        expect(system.getFacing(id)).toBeLessThanOrEqual(90)
    })

    it('弹丸沿武器实际朝向发射：背身（-Z/面朝 180°）时不会飞向 +Z 瞄准方向', () => {
        const {id} = system.add(rangedSaveConfig('throwing_dart'), 0, 0, 0)
        system.markPlayer(id)
        /* 角色背对 +Z（面朝 180°），相机瞄准 +Z */
        system.setFacing(id, 180)
        system.setPlayerMove(0, 0, false, 0, 1)
        system.setPlayerAttack('light')

        /* 飞镖为单 release 段：起手即出弹，此时身体尚未转向目标 */
        system.update(FIXED_TIME_STEP)

        const bullet = findBulletBody(shared)
        expect(bullet).toBeDefined()
        const linvel = bullet!.linvel()
        /* 弹道跟随枪口（大致朝 -Z），而不是瞄准方向 +Z */
        expect(linvel.z).toBeLessThan(0)
        expect(Math.abs(linvel.z)).toBeGreaterThan(Math.abs(linvel.x))
    })
})
