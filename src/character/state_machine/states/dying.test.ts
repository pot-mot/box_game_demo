import {describe, it, expect} from 'vitest'
import type RAPIER from '@dimforge/rapier3d-compat'
import {createCharacterStateMachine} from '../machine.ts'
import {createCombatComponent} from '../../combat/types.ts'
import {createWeaponRuntime} from '../../weapon/weapon_runtime.ts'
import type {CharacterEntity} from '../../types.ts'
import {DYING_FALL_DURATION} from './dying.ts'

const DT = 1 / 60

/** 最小实体 mock（body 为状态机读取的替身；appearanceGroup 只需提供朝向 yaw） */
const makeMock = (yaw = 0): CharacterEntity => {
    const state = {velocityX: 0, velocityY: 0, velocityZ: 0}
    const mockBody = {
        linvel: () => ({x: state.velocityX, y: state.velocityY, z: state.velocityZ}),
        setLinvel: ({x, y, z}: {x: number; y: number; z: number}): void => {
            state.velocityX = x
            state.velocityY = y
            state.velocityZ = z
        },
        translation: () => ({x: 0, y: 0, z: 0}),
        resetForces: (): void => {},
        addForce: (): void => {},
        mass: (): number => 1,
        wakeUp: (): void => {},
        handle: 1,
    }
    const runtime = createWeaponRuntime('long_sword')
    return {
        id: 1,
        config: {speed: 6, jumpHeight: 2, scale: 1},
        mesh: null!, wireframe: undefined,
        appearanceGroup: {rotation: {y: yaw}} as unknown as CharacterEntity['appearanceGroup'],
        body: mockBody as unknown as CharacterEntity['body'],
        mainCollider: undefined as unknown as RAPIER.Collider,
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        airborneTime: 0, groundedTime: 0,
        rowText: '', navEnabled: true, isPlayer: false, peaceStrategy: 'patrol', combatStrategy: 'tactical',
        isDying: false, dyingTimer: 0,
        dyingFallDirX: 0, dyingFallDirZ: 0, dyingFallAngle: 0,
        combat: createCombatComponent(runtime, 0, () => true, {tendencyId: 'hostileExceptSelf'}, 15),
        holdMode: runtime.holdMode,
        stateMachine: createCharacterStateMachine(),
    }
}

/** 进入 dying（先存好受击方向再置零血量，模拟最后受击致死） */
const enterDying = (entity: CharacterEntity): void => {
    entity.combat.health = 0
    entity.stateMachine.update(DT, entity)
    expect(entity.stateMachine.currentState).toBe('dying')
}

describe('死亡状态：倒地方向由最后受击冲击方向决定', () => {
    it('倒向取最后受击方向并归一化', () => {
        const e = makeMock()
        e.combat.lastHitDirX = 3
        e.combat.lastHitDirZ = 4
        enterDying(e)
        expect(e.dyingFallDirX).toBeCloseTo(0.6, 6)
        expect(e.dyingFallDirZ).toBeCloseTo(0.8, 6)
    })

    it('无受击记录时默认向后倒（面朝方向的反方向）', () => {
        const north = makeMock(0)
        enterDying(north)
        expect(north.dyingFallDirX).toBeCloseTo(0, 6)
        expect(north.dyingFallDirZ).toBeCloseTo(-1, 6)

        /* 面朝 +X（yaw = π/2）→ 向后倒 = -X */
        const east = makeMock(Math.PI / 2)
        enterDying(east)
        expect(east.dyingFallDirX).toBeCloseTo(-1, 6)
        expect(east.dyingFallDirZ).toBeCloseTo(0, 6)
    })

    it('倒下角度在 0.3s 内由 0 缓动到 90° 并保持（角度推进由 state 负责）', () => {
        const e = makeMock()
        e.combat.lastHitDirZ = 1
        enterDying(e)
        expect(e.dyingFallAngle).toBe(0)

        const half = Math.ceil(DYING_FALL_DURATION / DT / 2)
        for (let i = 0; i < half; i++) e.stateMachine.update(DT, e)
        expect(e.dyingFallAngle).toBeGreaterThan(0)
        expect(e.dyingFallAngle).toBeLessThan(Math.PI / 2)

        for (let i = 0; i < half; i++) e.stateMachine.update(DT, e)
        expect(e.dyingFallAngle).toBeCloseTo(Math.PI / 2, 6)

        /* 死亡计时继续推进到 isDead，倒地角度保持 */
        for (let i = 0; i < 30; i++) e.stateMachine.update(DT, e)
        expect(e.combat.isDead).toBe(true)
        expect(e.dyingFallAngle).toBeCloseTo(Math.PI / 2, 6)
    })
})
