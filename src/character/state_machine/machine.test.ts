import {describe, it, expect} from 'vitest'
import {Vec3} from 'cannon-es'
import {createCharacterStateMachine} from './machine.ts'
import type {CharacterStateMachine} from './types.ts'
import {createSkillSlot} from '../combat/skill_types.ts'
import {MELEE_SKILL_PRESETS} from '../combat/melee_skill.ts'
import type {CharacterEntity} from '../types.ts'

const DT = 1 / 60

/** 构造可驱动状态机的完整 CharacterEntity mock（真实 velocity + stateMachine） */
const makeMock = (): CharacterEntity => {
    const slot = createSkillSlot(MELEE_SKILL_PRESETS.long_sword_slash)
    return {
        id: 1,
        config: {speed: 6, jumpHeight: 2, radius: 0.125, height: 1},
        mesh: null!, wireframe: undefined,
        appearanceGroup: {rotation: {y: 0}} as unknown as CharacterEntity['appearanceGroup'],
        body: {mass: 1, force: new Vec3(), velocity: new Vec3(), wakeUp: () => {}} as unknown as CharacterEntity['body'],
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        airborneTime: 0, groundedTime: 0,
        rowText: '', isPlayer: false, peaceStrategy: 'patrol', combatStrategy: 'tactical',
        isDying: false, dyingTimer: 0, dashCooldownTimer: 0,
        combat: {
            faction: 0, health: 100, maxHealth: 100, isDead: false,
            damageModifiers: [],
            attackTendency: () => true,
            tendencyConfig: {tendencyId: 'hostileExceptSelf'},
            onDamageTaken: null, onDeath: null, onDamageDealt: null,
            skills: [slot], currentSkillIndex: 0,
            attackActive: false, attackTimer: 0,
            attackedTargets: new Set(), attackDirX: 0, attackDirZ: 0, swingTilt: 0,
        } as unknown as CharacterEntity['combat'],
        stateMachine: createCharacterStateMachine(),
    }
}

const run = (sm: CharacterStateMachine, e: CharacterEntity, frames: number): void => {
    for (let i = 0; i < frames; i++) sm.update(DT, e)
}

describe('平地移动', () => {
    it('平地（ny=1）行走不切 falling', () => {
        const e = makeMock()
        e.stateMachine.setInput(1, 0, false, false)
        run(e.stateMachine, e, 60)
        expect(e.stateMachine.currentState).toBe('walking')
    })
})

describe('斜坡 falling 判定', () => {
    const enterSteepSlope = (e: CharacterEntity): void => {
        e.stateMachine.setInput(1, 0, false, false)
        run(e.stateMachine, e, 9)
        expect(e.stateMachine.currentState).toBe('walking')
        e.groundNormal = {x: 0, y: 0.04, z: 0.999}
        /* airborneTime 累积 0.15s 后进入 falling */
        run(e.stateMachine, e, 9)
        expect(e.stateMachine.currentState).toBe('falling')
    }

    it('陡坡（ny=0.04）持续悬空后进入 falling', () => {
        const e = makeMock()
        enterSteepSlope(e)
        expect(e.stateMachine.currentState).toBe('falling')
    })

    it('接触法线噪声（ny 逐帧 0.6↔0.4）不抖动', () => {
        const e = makeMock()
        e.stateMachine.setInput(1, 0, false, false)
        run(e.stateMachine, e, 9)
        let prev = e.stateMachine.currentState
        let flips = 0
        for (let i = 0; i < 120; i++) {
            e.groundNormal = i % 2 === 0 ? {x: 0, y: 0.6, z: 0.8} : {x: 0, y: 0.04, z: 0.999}
            e.stateMachine.update(DT, e)
            if (e.stateMachine.currentState !== prev) {
                flips++
                prev = e.stateMachine.currentState
            }
        }
        expect(flips).toBeLessThanOrEqual(1)
    })

    it('falling 中坡变缓（ny=0.2 > 0.08）持续 0.15s 后恢复 walking', () => {
        const e = makeMock()
        enterSteepSlope(e)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('falling')

        e.groundNormal = {x: 0, y: 0.2, z: 0.98}
        run(e.stateMachine, e, 5)
        expect(e.stateMachine.currentState).toBe('falling')
        /* 浮点累计在 0.1s 边界可能差一帧，循环等待恢复 */
        for (let i = 0; i < 10 && e.stateMachine.currentState === 'falling'; i++) {
            e.stateMachine.update(DT, e)
        }
        expect(e.stateMachine.currentState).toBe('walking')
    })
})

describe('falling 行为', () => {
    const enterFalling = (e: CharacterEntity): void => {
        e.stateMachine.setInput(1, 0, false, false)
        run(e.stateMachine, e, 9)
        e.groundNormal = {x: 0, y: 0.04, z: 0.999}
        run(e.stateMachine, e, 9)
        expect(e.stateMachine.currentState).toBe('falling')
        /* 进入后置于 falling 滑动投影区（ny > FALL_SLIDE_MIN_NY） */
        e.groundNormal = {x: 0, y: 0.4, z: 0.9165}
    }

    it('有支撑时沿坡面滑动（v·n = 0）', () => {
        const e = makeMock()
        enterFalling(e)
        e.isOnGround = true
        e.body.velocity.set(5, -3, 0)
        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        const n = e.groundNormal
        const dot = e.body.velocity.x * n.x + e.body.velocity.y * n.y + e.body.velocity.z * n.z
        expect(Math.abs(dot)).toBeLessThan(0.001)
    })

    it('总速度（含 vy）钳制在 2×speed 内', () => {
        const e = makeMock()
        enterFalling(e)
        e.isOnGround = false
        e.body.velocity.set(15, -20, 0)
        e.stateMachine.update(DT, e)
        expect(e.body.velocity.length()).toBeLessThanOrEqual(12 + 0.001)
    })

    it('贴墙接触（ny ≤ FALL_SLIDE_MIN_NY）不投影，保留下落速度', () => {
        const e = makeMock()
        enterFalling(e)
        e.isOnGround = true
        e.groundNormal = {x: 0, y: 0.15, z: 0.9887}
        e.body.velocity.set(0, -3, 0)
        e.stateMachine.update(DT, e)
        expect(e.body.velocity.y).toBeCloseTo(-3, 5)
    })

    it('陡坡接触（ny > FALL_SLIDE_MIN_NY）投影滑动 v·n = 0', () => {
        const e = makeMock()
        enterFalling(e)
        e.isOnGround = true
        e.groundNormal = {x: 0, y: 0.4, z: 0.9165}
        e.body.velocity.set(5, -3, 0)
        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        const n = e.groundNormal
        const dot = e.body.velocity.x * n.x + e.body.velocity.y * n.y + e.body.velocity.z * n.z
        expect(Math.abs(dot)).toBeLessThan(0.001)
    })
})

describe('攻击/冲刺在陡坡结束', () => {
    it('attacking 在陡坡（ny=0.4）攻击结束进入 falling', () => {
        const e = makeMock()
        e.isOnGround = true
        e.groundNormal = {x: 0, y: 0.04, z: 0.999}
        e.stateMachine.setInput(0, 0, false, true, false, 0)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('attacking')
        e.stateMachine.setInput(1, 0, false, true, false, 0)
        run(e.stateMachine, e, 20)
        expect(e.stateMachine.currentState).toBe('falling')
    })

    it('attacking 在平地攻击结束进入 walking', () => {
        const e = makeMock()
        e.stateMachine.setInput(0, 0, false, true, false, 0)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('attacking')
        e.stateMachine.setInput(1, 0, false, true, false, 0)
        run(e.stateMachine, e, 20)
        expect(e.stateMachine.currentState).toBe('walking')
    })

    it('dashing 在陡坡（ny=0.4）冲刺结束进入 falling', () => {
        const e = makeMock()
        e.isOnGround = true
        e.groundNormal = {x: 0, y: 0.04, z: 0.999}
        e.stateMachine.setInput(1, 0, false, false, true)
        e.stateMachine.update(DT, e)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('dashing')
        run(e.stateMachine, e, 17)
        expect(e.stateMachine.currentState).toBe('falling')
    })

    it('dashing 在平地冲刺结束进入 walking', () => {
        const e = makeMock()
        e.stateMachine.setInput(1, 0, false, false, true)
        e.stateMachine.update(DT, e)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('dashing')
        run(e.stateMachine, e, 17)
        expect(e.stateMachine.currentState).toBe('walking')
    })
})

describe('斜坡防滑', () => {
    it('idle 在可站立斜坡上逐帧清零物理灌入的速度', () => {
        const e = makeMock()
        e.isOnGround = true
        e.groundNormal = {x: 0, y: 0.6, z: 0.8}
        e.stateMachine.setInput(0, 0, false, false)
        for (let i = 0; i < 60; i++) {
            /* 模拟物理引擎每帧沿坡灌入的重力速度 */
            e.body.velocity.set(0.1, -0.05, 0)
            e.stateMachine.update(DT, e)
            expect(e.stateMachine.currentState).toBe('idle')
            expect(e.body.velocity.length()).toBeCloseTo(0, 6)
        }
    })

    it('attacking 在可站立斜坡上逐帧清零物理灌入的速度', () => {
        const e = makeMock()
        e.isOnGround = true
        e.groundNormal = {x: 0, y: 0.6, z: 0.8}
        e.stateMachine.setInput(0, 0, false, true, false, 0)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('attacking')
        for (let i = 0; i < 12; i++) {
            e.body.velocity.set(0.1, -0.05, 0)
            e.stateMachine.update(DT, e)
            expect(e.body.velocity.length()).toBeCloseTo(0, 6)
        }
    })

    it('idle 无支撑时保留阻尼衰减（不误清速度）', () => {
        const e = makeMock()
        e.isOnGround = false
        e.body.velocity.set(3, 0, 0)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('idle')
        expect(e.body.velocity.x).toBeCloseTo(3 * 0.85, 5)
        expect(e.body.velocity.y).toBe(0)
    })
})

describe('跳跃', () => {
    it('跳跃顶点（vy ≤ 0）进入 falling', () => {
        const e = makeMock()
        e.stateMachine.setInput(0, 0, true, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('jumping')
        e.body.velocity.y = -1
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('falling')
    })

    it('上升段（vy > 0）即使脱离支撑也保持 jumping，不提前 falling', () => {
        const e = makeMock()
        e.stateMachine.setInput(0, 0, true, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('jumping')
        /* 模拟脱离支撑（coyote 过期）但仍在上升段 */
        e.isOnGround = false
        e.groundNormal = {x: 0, y: 1, z: 0}
        for (let i = 0; i < 30; i++) {
            e.body.velocity.y -= 9.82 * DT
            e.stateMachine.update(DT, e)
            expect(e.body.velocity.y).toBeGreaterThan(0)
            expect(e.stateMachine.currentState).toBe('jumping')
        }
        /* 越过顶点后进入 falling */
        for (let i = 0; i < 60; i++) {
            e.body.velocity.y -= 9.82 * DT
            e.stateMachine.update(DT, e)
            if (e.stateMachine.currentState !== 'jumping') break
        }
        expect(e.stateMachine.currentState).toBe('falling')
    })
})
