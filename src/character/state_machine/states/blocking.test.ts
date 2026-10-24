import {createTestCharacterState} from '../../state/test_state.ts'
import {describe, it, expect} from 'vitest'
import type RAPIER from '@dimforge/rapier3d-compat'
import {createCharacterStateMachine} from '../machine.ts'
import {createCombatComponent} from '../../combat/types.ts'
import {createWeaponRuntime} from '../../weapon/weapon_runtime.ts'
import {createBodyEnvironment} from '../../../physics/environment.ts'
import {moveSpeedOf, type CharacterEntity} from '../../types.ts'

const DT = 1 / 60

/** 最小实体 mock（body 为状态机 / 斜坡投影读取的替身；appearanceGroup 仅提供朝向 yaw） */
const makeMock = (weaponId = 'shield_medium'): CharacterEntity => {
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
    const runtime = createWeaponRuntime(weaponId)
    return {
        id: 1,
        config: {speed: 6, jumpHeight: 2, scale: 1},
        mesh: null!, wireframe: undefined,
        appearanceGroup: {rotation: {y: 0}} as unknown as CharacterEntity['appearanceGroup'],
        body: mockBody as unknown as CharacterEntity['body'],
        mainCollider: undefined as unknown as RAPIER.Collider,
        colliders: [],
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        airborneTime: 0, groundedTime: 0,
        rowText: '', navEnabled: true, isPlayer: false, peaceStrategy: 'patrol', combatStrategy: 'tactical', originStrategy: 'resident', originInterval: 20, chaseLeashRadius: 20, aiBlockDuration: 0.4, aiBlockCooldown: 1.2,
        isDying: false, dyingTimer: 0,
        dyingFallDirX: 0, dyingFallDirZ: 0, dyingFallAngle: 0,
        knockdownFallDirX: 0, knockdownFallDirZ: 0, knockdownFallAngle: 0,
        combat: createCombatComponent(runtime, 0, () => true, {tendencyId: 'hostileExceptSelf'}, 15),
        bodyState: {holdMode: runtime.holdMode},
        lockPoints: [],
        environment: createBodyEnvironment(),
        stateMachine: createCharacterStateMachine(),
        state: createTestCharacterState({}),
    }
}

/** 逐帧推进直到到达目标状态（返回耗时秒数；超时返回 undefined） */
const advanceUntil = (entity: CharacterEntity, state: CharacterEntity['stateMachine']['currentState'], maxSeconds = 5): number | undefined => {
    const maxSteps = Math.ceil(maxSeconds / DT)
    for (let i = 0; i < maxSteps; i++) {
        entity.stateMachine.update(DT, entity)
        if (entity.stateMachine.currentState === state) return (i + 1) * DT
    }
    return undefined
}

describe('格挡 / 破防状态', () => {
    it('持盾装备时解析格挡配置并把格挡槽初始化为上限', () => {
        const e = makeMock()
        expect(e.combat.block).toBeDefined()
        expect(e.combat.guard).toBeCloseTo(e.combat.block!.guardMax, 6)
    })

    it('block 输入从 idle 进入 blocking，退出时清除 blocking 标记', () => {
        const e = makeMock()
        e.stateMachine.setInput(0, 0, false, false, false, undefined, 0, false, false, true)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('blocking')
        expect(e.combat.blocking).toBe(true)

        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('idle')
        expect(e.combat.blocking).toBe(false)
    })

    it('无盾时 block 输入不进入 blocking', () => {
        const e = makeMock('long_sword')
        expect(e.combat.block).toBeUndefined()
        e.stateMachine.setInput(0, 0, false, false, false, undefined, 0, false, false, true)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('idle')
    })

    it('格挡期间移动按盾的移速系数限速', () => {
        const e = makeMock()
        e.stateMachine.setInput(0, 0, false, false, false, undefined, 0, false, false, true)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('blocking')

        e.stateMachine.setInput(13, 0, false, false, false, undefined, 0, false, false, true)
        e.stateMachine.update(DT, e)
        const expected = moveSpeedOf(e) * e.combat.block!.moveSpeedMultiplier
        expect(e.body.linvel().x).toBeCloseTo(expected, 5)
    })

    it('格挡槽归零强制进入 guard_broken，结束后回满格挡槽并回到 idle', () => {
        const e = makeMock()
        e.stateMachine.setInput(0, 0, false, false, false, undefined, 0, false, false, true)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('blocking')

        e.combat.guard = 0
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('guard_broken')
        expect(e.combat.blocking).toBe(false)

        const duration = e.combat.block!.guardBreakDuration
        const t = advanceUntil(e, 'idle')
        expect(t).toBeDefined()
        expect(t!).toBeGreaterThanOrEqual(duration)
        expect(e.combat.guard).toBeCloseTo(e.combat.block!.guardMax, 6)
    })

    it('倒地优先于破防（同时满足时进入 knockdown）', () => {
        const e = makeMock()
        e.combat.guard = 0
        e.combat.pendingKnockdown = true
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('knockdown')
    })
})
