import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld, type SharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import {FIXED_TIME_STEP} from '../../../physics/constants.ts'
import {RANGED_WEAPON_PRESETS} from '../../../character/weapon/ranged_weapon.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

/**
 * 远程瞄准 / 弹道朝向回归：
 * 1. 玩家远程攻击期间角色转向「瞄准方向」（相机前方），而不是保持原朝向；
 * 2. 玩家弹道水平方向严格取瞄准方向（相机前方），不受武器骨骼姿态偏差 / 上一帧采样延迟影响；
 * 3. 非玩家（AI）弹道仍取武器实际朝向（muzzleDir）。
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

/** 在飞弹丸是世界中唯一**启用中**的 sensor 刚体（池化空闲刚体被禁用，见 clear_bullets.test.ts） */
const findBulletBody = (shared: SharedWorld): RAPIER.RigidBody | undefined => {
    let found: RAPIER.RigidBody | undefined
    shared.world.bodies.forEach((body) => {
        if (!body.isEnabled()) return
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

    it('玩家弹道严格跟随瞄准方向：背身（面朝 180°）瞄准 +Z 时仍飞向 +Z', () => {
        const {id} = system.add(rangedSaveConfig('throwing_dart'), 0, 0, 0)
        system.markPlayer(id)
        /* 角色背对 +Z（面朝 180°），相机瞄准 +Z */
        system.setFacing(id, 180)
        system.setPlayerMove(0, 0, false, 0, 1)
        system.setPlayerAttack('light')

        /* 飞镖为单 release 段：起手即出弹；玩家弹道取瞄准方向，与身体是否已转向无关 */
        system.update(FIXED_TIME_STEP)

        const bullet = findBulletBody(shared)
        expect(bullet).toBeDefined()
        const linvel = bullet!.linvel()
        expect(linvel.z).toBeGreaterThan(0)
        expect(Math.abs(linvel.z)).toBeGreaterThan(Math.abs(linvel.x))
    })

    it('玩家弹道不受武器姿态偏差影响：长弓瞄准 +X 时弹道严格 +X', () => {
        /* 长弓释放帧的武器骨骼水平朝向约为 96°（相对瞄准方向偏 ~6°），
         * 旧逻辑据此发射会偏轴；玩家弹道改为取瞄准方向后应严格 +X */
        const {id} = system.add(rangedSaveConfig('longbow'), 0, 0, 0)
        system.markPlayer(id)
        system.setPlayerMove(0, 0, false, 1, 0)
        system.setPlayerAttack('light')

        let bullet: RAPIER.RigidBody | undefined
        for (let i = 0; i < 90 && bullet === undefined; i++) {
            system.update(FIXED_TIME_STEP)
            bullet = findBulletBody(shared)
        }
        expect(bullet).toBeDefined()
        const linvel = bullet!.linvel()
        const angle = Math.atan2(linvel.x, linvel.z) * 180 / Math.PI
        expect(Math.abs(angle - 90)).toBeLessThan(1)
    })

    it('玩家蓄力：按住冻结不出弹并累积力度，松开后按蓄力缩放弹速', () => {
        const {id} = system.add(rangedSaveConfig('longbow'), 0, 0, 0)
        system.markPlayer(id)
        system.setPlayerMove(0, 0, false, 0, 1)
        system.beginPlayerAttackHold('light')

        /* 按住 1s：进入 attacking 并冻结在 aim，未发射 */
        for (let i = 0; i < 60; i++) system.update(FIXED_TIME_STEP)
        expect(findBulletBody(shared)).toBeUndefined()
        const player = system.getAll().find(c => c.id === id)!
        expect(player.combat.attackHolding).toBe(true)
        expect(player.combat.attackCharge).toBeGreaterThan(0.8)

        /* 松开：推进到 release 并发射，满蓄力按 maxSpeedScale */
        system.endPlayerAttackHold('light', 1)
        for (let i = 0; i < 30 && findBulletBody(shared) === undefined; i++) system.update(FIXED_TIME_STEP)
        const bullet = findBulletBody(shared)
        expect(bullet).toBeDefined()
        const lv = bullet!.linvel()
        const bow = RANGED_WEAPON_PRESETS.longbow
        const maxSpeed = bow.projectileSpeed * bow.charge!.maxSpeedScale
        /* 蓄力接近满值：弹速显著高于未蓄力预设（20），且不超过满蓄力上限 */
        expect(Math.hypot(lv.x, lv.z)).toBeGreaterThan(bow.projectileSpeed * 1.5)
        expect(Math.hypot(lv.x, lv.z)).toBeLessThanOrEqual(maxSpeed + 0.01)
    })

    it('玩家蓄力后拖拽取消：不出弹并退出 attacking', () => {
        const {id} = system.add(rangedSaveConfig('longbow'), 0, 0, 0)
        system.markPlayer(id)
        system.setPlayerMove(0, 0, false, 0, 1)
        system.beginPlayerAttackHold('light')
        for (let i = 0; i < 30; i++) system.update(FIXED_TIME_STEP)
        expect(findBulletBody(shared)).toBeUndefined()

        system.cancelPlayerAttackHold()
        for (let i = 0; i < 30; i++) system.update(FIXED_TIME_STEP)

        expect(findBulletBody(shared)).toBeUndefined()
        const player = system.getAll().find(c => c.id === id)!
        expect(player.combat.attackActive).toBe(false)
        expect(player.stateMachine.currentState).not.toBe('attacking')
    })
})
