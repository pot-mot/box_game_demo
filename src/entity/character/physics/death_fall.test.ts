import {describe, it, expect, beforeAll, afterAll, beforeEach, vi} from 'vitest'
import {Scene, Vector3} from 'three'
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

const DT = 1 / 60

describe('死亡倒下（世界层按最后受击方向合成根旋转）', () => {
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

    /** 生成角色 → 走伤害回调记录冲击方向（与真实命中路径一致）→ 置零血量致死 → 推进若干帧 */
    const dieWithHitDir = (hitDirX: number, hitDirZ: number, frames = 30) => {
        const {id} = system.add(meleeSaveConfig(), 0, 0, 0)
        const entity = system.getAll().find(candidate => candidate.id === id)!
        entity.combat.onDamageTaken?.(1, {
            sourceId: 999,
            targetId: id,
            baseAmount: 1,
            finalAmount: 1,
            skillId: 'test',
            dirX: hitDirX,
            dirZ: hitDirZ,
        })
        /* 伤害回调把冲击方向记录到 combat（死亡 state 的输入） */
        expect(entity.combat.lastHitDirX).toBeCloseTo(hitDirX, 6)
        expect(entity.combat.lastHitDirZ).toBeCloseTo(hitDirZ, 6)
        entity.combat.health = 0
        for (let i = 0; i < frames; i++) system.update(DT)
        return entity
    }

    it('受击来自 -Z（冲击方向 +Z）：绕 +X 轴前倒，面朝 +Z 的身体贴地', () => {
        const entity = dieWithHitDir(0, 1)
        expect(entity.stateMachine.currentState).toBe('dying')
        const up = new Vector3(0, 1, 0).applyQuaternion(entity.appearanceGroup.quaternion)
        const forward = new Vector3(0, 0, 1).applyQuaternion(entity.appearanceGroup.quaternion)
        /* 向上轴倒向 +Z、前方向转向地面（-Y）：前倒 */
        expect(up.z).toBeGreaterThan(0.9)
        expect(forward.y).toBeLessThan(-0.9)
    })

    it('受击来自 +Z（冲击方向 -Z）：绕 -X 轴后倒，背贴地', () => {
        const entity = dieWithHitDir(0, -1)
        const forward = new Vector3(0, 0, 1).applyQuaternion(entity.appearanceGroup.quaternion)
        const up = new Vector3(0, 1, 0).applyQuaternion(entity.appearanceGroup.quaternion)
        /* 向上轴倒向 -Z、前方向抬起（+Y）：后倒（仰面） */
        expect(up.z).toBeLessThan(-0.9)
        expect(forward.y).toBeGreaterThan(0.9)
    })

    it('侧向受击（冲击方向 +X）：绕 -Z 轴侧倒，倒向 +X', () => {
        const entity = dieWithHitDir(1, 0)
        const up = new Vector3(0, 1, 0).applyQuaternion(entity.appearanceGroup.quaternion)
        expect(up.x).toBeGreaterThan(0.9)
    })

    it('死亡动画本身直立：倒下角度全由状态与受击方向决定', () => {
        const entity = dieWithHitDir(0, 1, 1)
        /* 进入死亡首帧即后倒过程中，角度从 0 开始（非 clip 内置前倒） */
        expect(entity.dyingFallAngle).toBeLessThan(Math.PI / 2)
        expect(entity.dyingFallDirZ).toBeCloseTo(1, 6)
    })
})
