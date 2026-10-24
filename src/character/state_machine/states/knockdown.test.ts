import {createTestCharacterState} from '../../state/test_state.ts'
import {describe, it, expect} from 'vitest'
import type RAPIER from '@dimforge/rapier3d-compat'
import {createCharacterStateMachine} from '../machine.ts'
import {createCombatComponent} from '../../combat/types.ts'
import {createWeaponRuntime} from '../../weapon/weapon_runtime.ts'
import {KNOCKDOWN_FALL_RATIO} from '../../combat/constants.ts'
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
    const combat = createCombatComponent(runtime, 0, () => true, {tendencyId: 'hostileExceptSelf'}, 15)
    const characterState = createTestCharacterState({
        id: 1,
        config: {speed: 6, jumpHeight: 2, scale: 1},
        combat,
        bodyState: {holdMode: runtime.holdMode},
    })
    characterState.physics.isOnGround = true
    return {
        state: characterState,
        mesh: null!, wireframe: undefined,
        appearanceGroup: {rotation: {y: yaw}} as unknown as CharacterEntity['appearanceGroup'],
        body: mockBody as unknown as CharacterEntity['body'],
        mainCollider: undefined as unknown as RAPIER.Collider,
        colliders: [],
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
    entity.state.combat.pendingKnockdown = true
    entity.stateMachine.update(DT, entity)
    expect(entity.stateMachine.currentState).toBe('knockdown')
}

describe('倒地 / 起身状态', () => {
    it('pendingKnockdown 从任意状态强制进入 knockdown，清标记、挂全程免疫、写入倒向', () => {
        const e = makeMock()
        e.state.combat.lastHitDirX = 3
        e.state.combat.lastHitDirZ = 4
        enterKnockdown(e)
        expect(e.state.combat.pendingKnockdown).toBe(false)
        expect(e.state.combat.hitImmunityTimer).toBeCloseTo(e.state.combat.knockdownDuration + e.state.combat.getUpTurnDuration + e.state.combat.getUpDuration, 6)
        expect(e.state.timers.knockdownFallDirX).toBeCloseTo(0.6, 6)
        expect(e.state.timers.knockdownFallDirZ).toBeCloseTo(0.8, 6)
        expect(e.state.timers.knockdownFallAngle).toBe(0)
    })

    it('无受击记录时默认向后倒（面朝方向的反方向）', () => {
        const north = makeMock(0)
        enterKnockdown(north)
        expect(north.state.timers.knockdownFallDirX).toBeCloseTo(0, 6)
        expect(north.state.timers.knockdownFallDirZ).toBeCloseTo(-1, 6)

        /* 面朝 +X（yaw = π/2）→ 向后倒 = -X */
        const east = makeMock(Math.PI / 2)
        enterKnockdown(east)
        expect(east.state.timers.knockdownFallDirX).toBeCloseTo(-1, 6)
        expect(east.state.timers.knockdownFallDirZ).toBeCloseTo(0, 6)
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
        e.state.combat.health = 0
        e.state.combat.pendingKnockdown = true
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('dying')
    })

    it('knockdown 期间忽略 pendingFlinch', () => {
        const e = makeMock()
        enterKnockdown(e)
        e.state.combat.pendingFlinch = true
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('knockdown')
    })

    it('倒地前半段完成 0→90° 倒下，后半段保持完全倒地的最后一帧', () => {
        const e = makeMock()
        enterKnockdown(e)
        const fallDuration = e.state.combat.knockdownDuration * KNOCKDOWN_FALL_RATIO
        /* 倒下过程中 */
        const midSteps = Math.floor((fallDuration / 2) / DT)
        for (let i = 0; i < midSteps; i++) e.stateMachine.update(DT, e)
        expect(e.state.timers.knockdownFallAngle).toBeGreaterThan(0)
        expect(e.state.timers.knockdownFallAngle).toBeLessThan(Math.PI / 2)
        /* 倒下完成后到状态结束前：角度保持 90°，不再有任何动作 */
        while (e.stateMachine.currentState === 'knockdown'
            && e.stateMachine.stateTime < e.state.combat.knockdownDuration - DT) {
            e.stateMachine.update(DT, e)
        }
        expect(e.stateMachine.currentState).toBe('knockdown')
        expect(e.stateMachine.stateTime).toBeGreaterThan(fallDuration)
        expect(e.state.timers.knockdownFallAngle).toBeCloseTo(Math.PI / 2, 6)
    })

    it('起身前翻身时长按水平转角换算：180° = 0.25s，90° = 0.125s，已俯卧 = 0', () => {
        /* 默认向后倒：面朝与倒向相差 180° */
        const backward = makeMock(0)
        enterKnockdown(backward)
        expect(backward.state.combat.getUpTurnDuration).toBeCloseTo(0.25, 6)

        /* 倒向 = 面朝（角色正面朝下）：无需翻身 */
        const prone = makeMock(0)
        prone.state.combat.lastHitDirX = 0
        prone.state.combat.lastHitDirZ = 1
        enterKnockdown(prone)
        expect(prone.state.combat.getUpTurnDuration).toBeCloseTo(0, 6)

        /* 侧面倒地：相差 90° */
        const side = makeMock(0)
        side.state.combat.lastHitDirX = 1
        side.state.combat.lastHitDirZ = 0
        enterKnockdown(side)
        expect(side.state.combat.getUpTurnDuration).toBeCloseTo(0.125, 6)
    })

    it('knockdown → getting_up：先躺地翻身（角度保持 90°），翻身后角度缓动回 0 并在结束回满韧性、清免疫', () => {
        const e = makeMock()
        enterKnockdown(e)
        e.state.combat.poise = 3
        const t = advanceUntil(e, 'getting_up')
        expect(t).toBeDefined()
        expect(t!).toBeGreaterThanOrEqual(e.state.combat.knockdownDuration)
        expect(e.state.timers.knockdownFallAngle).toBeCloseTo(Math.PI / 2, 6)
        /* 翻身阶段仍完全伏地，不开始爬起 */
        e.stateMachine.update(DT, e)
        expect(e.state.timers.knockdownFallAngle).toBeCloseTo(Math.PI / 2, 6)
        /* 翻身后角度递减 */
        const turnSteps = Math.ceil(e.state.combat.getUpTurnDuration / DT) + 1
        for (let i = 0; i < turnSteps; i++) e.stateMachine.update(DT, e)
        expect(e.state.timers.knockdownFallAngle).toBeLessThan(Math.PI / 2)

        const t2 = advanceUntil(e, 'idle')
        expect(t2).toBeDefined()
        expect(e.state.combat.hitImmunityTimer).toBe(0)
        expect(e.state.combat.poise).toBeCloseTo(e.state.combat.poiseMax, 6)
        expect(e.state.timers.knockdownFallAngle).toBe(0)
    })

    it('起身根旋转分三拍：撑地阶段仍接近伏地，推起阶段快速回落，结束归零', () => {
        const e = makeMock()
        enterKnockdown(e)
        expect(advanceUntil(e, 'getting_up')).toBeDefined()
        const turn = e.state.combat.getUpTurnDuration
        const rise = e.state.combat.getUpDuration
        const stepToTime = (target: number): void => {
            while (e.stateMachine.currentState === 'getting_up' && e.stateMachine.stateTime < target) {
                e.stateMachine.update(DT, e)
            }
        }
        /* 翻身阶段：保持完全伏地 */
        stepToTime(turn * 0.5)
        expect(e.state.timers.knockdownFallAngle).toBeCloseTo(Math.PI / 2, 6)
        /* 撑地段：双手撑地发力，身体只抬起很小角度 */
        stepToTime(turn + rise * 0.15)
        const planted = e.state.timers.knockdownFallAngle
        expect(planted).toBeGreaterThan(Math.PI / 2 - 0.1)
        /* 推起段：收腿蹬手后根旋转快速回落 */
        stepToTime(turn + rise * 0.6)
        expect(e.state.timers.knockdownFallAngle).toBeLessThan(planted - 0.5)
        /* 收尾段：接近站直 */
        stepToTime(turn + rise * 0.95)
        expect(e.state.timers.knockdownFallAngle).toBeLessThan(0.1)
        expect(advanceUntil(e, 'idle')).toBeDefined()
        expect(e.state.timers.knockdownFallAngle).toBe(0)
    })
})
