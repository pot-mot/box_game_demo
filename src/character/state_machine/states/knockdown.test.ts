import {describe, it, expect} from 'vitest'
import type RAPIER from '@dimforge/rapier3d-compat'
import {createCharacterStateMachine} from '../machine.ts'
import {createCombatComponent} from '../../combat/types.ts'
import {createWeaponRuntime} from '../../weapon/weapon_runtime.ts'
import type {CharacterEntity} from '../../types.ts'

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
        rowText: '', navEnabled: true, isPlayer: false, peaceStrategy: 'patrol', combatStrategy: 'tactical', originStrategy: 'resident', originInterval: 20, chaseLeashRadius: 20,
        isDying: false, dyingTimer: 0,
        dyingFallDirX: 0, dyingFallDirZ: 0, dyingFallAngle: 0,
        knockdownFallDirX: 0, knockdownFallDirZ: 0, knockdownFallAngle: 0,
        combat: createCombatComponent(runtime, 0, () => true, {tendencyId: 'hostileExceptSelf'}, 15),
        holdMode: runtime.holdMode,
        lockPoints: [],
        stateMachine: createCharacterStateMachine(),
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

/** 从 idle 进入 knockdown（模拟受到 knockdown 级冲击） */
const enterKnockdown = (entity: CharacterEntity): void => {
    entity.combat.pendingKnockdown = true
    entity.stateMachine.update(DT, entity)
    expect(entity.stateMachine.currentState).toBe('knockdown')
}

describe('倒地 / 起身状态', () => {
    it('pendingKnockdown 从任意状态强制进入 knockdown，清标记、挂全程免疫、写入倒向', () => {
        const e = makeMock()
        e.combat.lastHitDirX = 3
        e.combat.lastHitDirZ = 4
        enterKnockdown(e)
        expect(e.combat.pendingKnockdown).toBe(false)
        expect(e.combat.hitImmunityTimer).toBeCloseTo(e.combat.knockdownDuration + e.combat.getUpDuration, 6)
        expect(e.knockdownFallDirX).toBeCloseTo(0.6, 6)
        expect(e.knockdownFallDirZ).toBeCloseTo(0.8, 6)
        expect(e.knockdownFallAngle).toBe(0)
    })

    it('无受击记录时默认向后倒（面朝方向的反方向）', () => {
        const north = makeMock(0)
        enterKnockdown(north)
        expect(north.knockdownFallDirX).toBeCloseTo(0, 6)
        expect(north.knockdownFallDirZ).toBeCloseTo(-1, 6)

        /* 面朝 +X（yaw = π/2）→ 向后倒 = -X */
        const east = makeMock(Math.PI / 2)
        enterKnockdown(east)
        expect(east.knockdownFallDirX).toBeCloseTo(-1, 6)
        expect(east.knockdownFallDirZ).toBeCloseTo(0, 6)
    })

    it('倒地 / 起身仅清水平速度，保留垂直速度（空中被击倒仍受重力下落）', () => {
        const e = makeMock()
        e.body.setLinvel({x: 3, y: -5, z: -2}, true)
        enterKnockdown(e)
        const knocked = e.body.linvel()
        expect(knocked.x).toBeCloseTo(0, 6)
        expect(knocked.z).toBeCloseTo(0, 6)
        expect(knocked.y).toBeCloseTo(-5, 6)

        expect(advanceUntil(e, 'getting_up')).toBeDefined()
        const gettingUp = e.body.linvel()
        expect(gettingUp.x).toBeCloseTo(0, 6)
        expect(gettingUp.z).toBeCloseTo(0, 6)
        expect(gettingUp.y).toBeCloseTo(-5, 6)
    })

    it('血量归零时 dying 优先于 knockdown', () => {
        const e = makeMock()
        e.combat.health = 0
        e.combat.pendingKnockdown = true
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('dying')
    })

    it('knockdown 期间忽略 pendingFlinch', () => {
        const e = makeMock()
        enterKnockdown(e)
        e.combat.pendingFlinch = true
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('knockdown')
    })

    it('倒下角度在 knockdownDuration 内由 0 缓动到 90°', () => {
        const e = makeMock()
        enterKnockdown(e)
        const steps = Math.floor((e.combat.knockdownDuration / DT) / 2)
        for (let i = 0; i < steps; i++) e.stateMachine.update(DT, e)
        expect(e.knockdownFallAngle).toBeGreaterThan(0)
        expect(e.knockdownFallAngle).toBeLessThan(Math.PI / 2)
    })

    it('knockdown → getting_up（时长到达），起身角度由 90° 缓动回 0 并在结束回满韧性、清免疫', () => {
        const e = makeMock()
        enterKnockdown(e)
        e.combat.poise = 3
        const t = advanceUntil(e, 'getting_up')
        expect(t).toBeDefined()
        expect(t!).toBeGreaterThanOrEqual(e.combat.knockdownDuration)
        expect(e.knockdownFallAngle).toBeCloseTo(Math.PI / 2, 6)
        /* 起身过程角度递减 */
        e.stateMachine.update(DT, e)
        expect(e.knockdownFallAngle).toBeLessThan(Math.PI / 2)

        const t2 = advanceUntil(e, 'idle')
        expect(t2).toBeDefined()
        expect(e.combat.hitImmunityTimer).toBe(0)
        expect(e.combat.poise).toBeCloseTo(e.combat.poiseMax, 6)
        expect(e.knockdownFallAngle).toBe(0)
    })
})
