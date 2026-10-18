import {describe, it, expect} from 'vitest'
import type RAPIER from '@dimforge/rapier3d-compat'
import {createCharacterStateMachine} from '../machine.ts'
import {createCombatComponent} from '../../combat/types.ts'
import {createWeaponRuntime} from '../../weapon/weapon_runtime.ts'
import {createBodyEnvironment} from '../../../physics/environment.ts'
import type {CharacterEntity} from '../../types.ts'

const DT = 1 / 60

/** 最小实体 mock（body 提供状态机读取的速度；environment.fluidFraction 控制浸没） */
const makeMock = (isOnGround = false): CharacterEntity => {
    const state = {vx: 0, vy: 0, vz: 0}
    const mockBody = {
        linvel: () => ({x: state.vx, y: state.vy, z: state.vz}),
        setLinvel: ({x, y, z}: {x: number; y: number; z: number}): void => { state.vx = x; state.vy = y; state.vz = z },
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
        mesh: null!,
        wireframe: undefined,
        appearanceGroup: {rotation: {y: 0}} as unknown as CharacterEntity['appearanceGroup'],
        body: mockBody as unknown as CharacterEntity['body'],
        mainCollider: undefined as unknown as RAPIER.Collider,
        colliders: [],
        isOnGround,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        airborneTime: 0, groundedTime: 0,
        rowText: '', navEnabled: true, isPlayer: false, peaceStrategy: 'patrol', combatStrategy: 'tactical', originStrategy: 'resident', originInterval: 20, chaseLeashRadius: 20, aiBlockDuration: 0.4, aiBlockCooldown: 1.2,
        isDying: false, dyingTimer: 0, dyingFallDirX: 0, dyingFallDirZ: 0, dyingFallAngle: 0, knockdownFallDirX: 0, knockdownFallDirZ: 0, knockdownFallAngle: 0,
        combat: createCombatComponent(runtime, 0, () => true, {tendencyId: 'hostileExceptSelf'}, 15),
        holdMode: runtime.holdMode,
        lockPoints: [],
        environment: createBodyEnvironment(),
        stateMachine: createCharacterStateMachine(),
    }
}

describe('游泳 / 漂浮状态转换', () => {
    it('浸没且无输入 → floating', () => {
        const e = makeMock()
        e.environment.fluidFraction = 0.6
        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('floating')
    })

    it('浸没且有移动输入 → swimming', () => {
        const e = makeMock()
        e.environment.fluidFraction = 0.6
        e.stateMachine.setInput(1, 0, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('swimming')
    })

    it('swimming 无输入 → floating；有输入 → swimming', () => {
        const e = makeMock()
        e.environment.fluidFraction = 0.6
        e.stateMachine.setInput(1, 0, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('swimming')
        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('floating')
        e.stateMachine.setInput(0, 1, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('swimming')
    })

    it('退出水体且着地 → idle / walking', () => {
        const e = makeMock(true)
        e.environment.fluidFraction = 0.6
        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('floating')
        e.environment.fluidFraction = 0
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('idle')
    })

    it('退出水体且悬空 → falling', () => {
        const e = makeMock(false)
        e.environment.fluidFraction = 0.6
        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('floating')
        e.environment.fluidFraction = 0
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('falling')
    })
})
