import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld, type SharedWorld} from '../../../physics/world.ts'
import {setupCharacterEntities, type CharacterEntitySystem} from './world.ts'
import {FIXED_TIME_STEP} from '../../../physics/constants.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'

/**
 * 子弹清理回归：子弹是战斗期临时对象（不进存档、不属任何实体系统），
 * Reset 还原世界时若不显式清理，会残留到还原后的世界里继续飞行。
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

/** 世界内 sensor 碰撞体数量：子弹是唯一带 sensor 碰撞体的刚体 */
const countSensorColliders = (shared: SharedWorld): number => {
    let count = 0
    shared.world.bodies.forEach((body) => {
        for (let i = 0; i < body.numColliders(); i++) {
            if (body.collider(i).isSensor()) count += 1
        }
    })
    return count
}

const rangedSaveConfig = (): CharacterSaveConfig => ({
    speed: 6,
    jumpHeight: 2,
    scale: 1,
    attack: {
        weaponId: 'longbow',
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
    isPlayer: false,
})

describe('角色系统的子弹清理', () => {
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

    /** 让玩家角色朝 +Z 攻击一次并推进到子弹出现的那一帧，返回「开火前」的场景子节点数基线 */
    const fireOneBullet = (): number => {
        const {id} = system.add(rangedSaveConfig(), 0, 0, 0)
        system.markPlayer(id)
        /* 角色 mesh / 外观组 / 刀光 / 调试线框在 add 时已入场景，基线须在其后采样 */
        const childrenBeforeFire = scene.children.length
        system.setPlayerMove(0, 0, false, 0, 1)
        system.setPlayerAttack('light')
        for (let i = 0; i < 180; i++) {
            system.update(FIXED_TIME_STEP)
            if (countSensorColliders(shared) > 0) return childrenBeforeFire
        }
        throw new Error('角色未在 180 帧内发射子弹')
    }

    it('远程攻击产生子弹（物理 sensor 刚体 + 场景 mesh）', () => {
        const childrenBeforeFire = fireOneBullet()
        expect(countSensorColliders(shared)).toBe(1)
        expect(scene.children.length).toBe(childrenBeforeFire + 1)
    })

    it('clearBullets 移除在飞子弹的物理刚体与场景 mesh', () => {
        const childrenBeforeFire = fireOneBullet()

        system.clearBullets()

        expect(countSensorColliders(shared)).toBe(0)
        expect(scene.children.length).toBe(childrenBeforeFire)
        /* 刚体句柄已彻底移除：继续步进物理世界不应报错 */
        expect(() => shared.world.step(shared.eventQueue)).not.toThrow()
    })

    it('没有子弹时调用是空操作', () => {
        const childrenBefore = scene.children.length
        system.clearBullets()
        expect(countSensorColliders(shared)).toBe(0)
        expect(scene.children.length).toBe(childrenBefore)
    })
})
