import {createTestCharacterState} from '../../state/test_state.ts'
import {describe, it, expect} from 'vitest'
import type RAPIER from '@dimforge/rapier3d-compat'
import {createCharacterStateMachine} from '../machine.ts'
import {createCombatComponent} from '../../combat/types.ts'
import {createWeaponRuntime} from '../../weapon/weapon_runtime.ts'
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
    const combat = createCombatComponent(runtime, 0, () => true, {tendencyId: 'hostileExceptSelf'}, 15)
    const characterState = createTestCharacterState({
        id: 1,
        config: {speed: 6, jumpHeight: 2, scale: 1},
        combat,
        bodyState: {holdMode: runtime.holdMode},
    })
    characterState.physics.isOnGround = isOnGround
    return {
        state: characterState,
        mesh: null!, wireframe: undefined,
        appearanceGroup: {rotation: {y: 0}} as unknown as CharacterEntity['appearanceGroup'],
        body: mockBody as unknown as CharacterEntity['body'],
        mainCollider: undefined as unknown as RAPIER.Collider,
        colliders: [],
        stateMachine: createCharacterStateMachine(),
    }
}

describe('游泳 / 漂浮状态转换', () => {
    it('浸没且无输入 → floating', () => {
        const e = makeMock()
        e.state.environment.fluidFraction = 0.6
        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('floating')
    })

    it('浸没且有移动输入 → swimming', () => {
        const e = makeMock()
        e.state.environment.fluidFraction = 0.6
        e.stateMachine.setInput(1, 0, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('swimming')
    })

    it('swimming 无输入 → floating；有输入 → swimming', () => {
        const e = makeMock()
        e.state.environment.fluidFraction = 0.6
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
        e.state.environment.fluidFraction = 0.6
        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('floating')
        e.state.environment.fluidFraction = 0
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('idle')
    })

    it('退出水体且悬空 → falling', () => {
        const e = makeMock(false)
        e.state.environment.fluidFraction = 0.6
        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('floating')
        e.state.environment.fluidFraction = 0
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('falling')
    })
})
