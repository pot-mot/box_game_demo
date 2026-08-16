import {describe, it, expect} from 'vitest'
import type RAPIER from '@dimforge/rapier3d-compat'
import {createCharacterStateMachine} from './machine.ts'
import type {CharacterStateMachine} from './types.ts'
import {buildMeleeSkillSlots} from '../combat/melee_skill.ts'
import {createDashSkillSlot, DASH_COOLDOWN} from '../combat/dash_skill.ts'
import {buildTestWeaponSkillSlots, TEST_WEAPON_CHARGE_HOLD} from '../combat/test_weapon.ts'
import type {SkillSlot} from '../combat/skill_types.ts'
import {FLINCH_IMMUNITY_DURATION} from '../combat/attack_phases.ts'
import type {CharacterEntity} from '../types.ts'

const DT = 1 / 60

/** 构造可驱动状态机的完整 CharacterEntity mock（真实 entity body mock + stateMachine）。
 *  mock 仅覆盖状态机路径使用到的接口子集，集中窄化一次避免测试体散落断言转换 */
const makeMock = (slots: SkillSlot[] = buildMeleeSkillSlots('short_sword')): CharacterEntity => {
    const mockBody = {
        linvel: (): {x: number; y: number; z: number} => ({x: state.velocityX, y: state.velocityY, z: state.velocityZ}),
        setLinvel: ({x, y, z}: {x: number; y: number; z: number}): void => {
            state.velocityX = x
            state.velocityY = y
            state.velocityZ = z
        },
        translation: (): {x: number; y: number; z: number} => ({x: state.posX, y: state.posY, z: state.posZ}),
        resetForces: (): void => {},
        addForce: (): void => {},
        mass: (): number => 1,
        wakeUp: (): void => {},
        handle: 1,
    }

    const state = {velocityX: 0, velocityY: 0, velocityZ: 0, posX: 0, posY: 0, posZ: 0}

    return {
        id: 1,
        config: {speed: 6, jumpHeight: 2, scale: 1},
        mesh: null!, wireframe: undefined,
        appearanceGroup: {rotation: {y: 0}} as unknown as CharacterEntity['appearanceGroup'],
        body: mockBody as unknown as CharacterEntity['body'],
        mainCollider: undefined as unknown as RAPIER.Collider,
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        airborneTime: 0, groundedTime: 0,
        rowText: '', navEnabled: true, isPlayer: false, peaceStrategy: 'patrol', combatStrategy: 'tactical',
        isDying: false, dyingTimer: 0,
        combat: {
            faction: 0, health: 100, maxHealth: 100, isDead: false,
            damageModifiers: [],
            attackTendency: () => true,
            tendencyConfig: {tendencyId: 'hostileExceptSelf'},
            onDamageTaken: null, onDeath: null, onDamageDealt: null,
            skills: slots, dashSkill: createDashSkillSlot(), currentSkillIndex: 0,
            attackActive: false, attackTimer: 0,
            attackedTargets: new Set(), attackDirX: 0, attackDirZ: 0, swingTilt: 0,
            phaseIndex: 0, phaseTimer: 0, chainEntryIndex: 0, bufferedSkillIndex: -1, pendingFlinch: false, flinchImmunityTimer: 0,
        } as unknown as CharacterEntity['combat'],
        stateMachine: createCharacterStateMachine(),
    }
}

const run = (sm: CharacterStateMachine, e: CharacterEntity, frames: number): void => {
    for (let i = 0; i < frames; i++) sm.update(DT, e)
}

describe('连段守卫（test_weapon 蓄力/方向组合键）', () => {
    const makeTest = (): CharacterEntity => makeMock(buildTestWeaponSkillSlots())

    it('轻击键点按（hold=0）起手 = tap（索引 1，守卫变体未通过 → 兜底）', () => {
        const e = makeTest()
        e.stateMachine.setInput(0, 0, false, true, false, 0, 0)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('attacking')
        expect(e.combat.currentSkillIndex).toBe(1)
    })

    it('轻击键长按 >= 阈值起手 = charge（索引 0，守卫变体优先）', () => {
        const e = makeTest()
        e.stateMachine.setInput(0, 0, false, true, false, 0, TEST_WEAPON_CHARGE_HOLD)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('attacking')
        expect(e.combat.currentSkillIndex).toBe(0)
    })

    it('重击键起手 = heavy_1（索引 2，entryGroup 映射）', () => {
        const e = makeTest()
        e.stateMachine.setInput(0, 0, false, true, false, 1, 0)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('attacking')
        expect(e.combat.currentSkillIndex).toBe(2)
    })

    it('起手槽全冷却时不进入 attacking', () => {
        const e = makeTest()
        e.combat.skills[0].cooldownTimer = 1
        e.combat.skills[1].cooldownTimer = 1
        e.stateMachine.setInput(0, 0, false, true, false, 0, 0)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('idle')
    })

    it('段末缓冲：同键组 + 有移动输入 → 方向变体 thrust（索引 3）', () => {
        const e = makeTest()
        e.stateMachine.setInput(0, 0, false, true, false, 0, 0)
        e.stateMachine.update(DT, e)
        expect(e.combat.currentSkillIndex).toBe(1)
        /* 按住攻击键并带方向：缓冲逐帧解析为 thrust（hasMoveInput 通过） */
        e.stateMachine.setInput(1, 0, false, true, false, 0, 0)
        run(e.stateMachine, e, 30)
        expect(e.stateMachine.currentState).toBe('attacking')
        expect(e.combat.currentSkillIndex).toBe(3)
    })

    it('段末缓冲：同键组 + 无移动输入 → 兜底 light_2（索引 4）', () => {
        const e = makeTest()
        e.stateMachine.setInput(0, 0, false, true, false, 0, 0)
        e.stateMachine.update(DT, e)
        e.stateMachine.setInput(0, 0, false, true, false, 0, 0)
        run(e.stateMachine, e, 30)
        expect(e.stateMachine.currentState).toBe('attacking')
        expect(e.combat.currentSkillIndex).toBe(4)
    })

    it('charge 无链：播完无缓冲回 idle', () => {
        const e = makeTest()
        e.stateMachine.setInput(0, 0, false, true, false, 0, TEST_WEAPON_CHARGE_HOLD)
        e.stateMachine.update(DT, e)
        expect(e.combat.currentSkillIndex).toBe(0)
        e.stateMachine.setInput(0, 0, false, false, false, 0, 0)
        run(e.stateMachine, e, 60)
        expect(e.stateMachine.currentState).toBe('idle')
    })

    it('蓄力段触发即挂冷却（charge 槽），点按兜底不受影响', () => {
        const e = makeTest()
        e.stateMachine.setInput(0, 0, false, true, false, 0, TEST_WEAPON_CHARGE_HOLD)
        e.stateMachine.update(DT, e)
        /* 触发即挂冷却（单测无主循环递减，冷却值保持满值） */
        expect(e.combat.skills[0].cooldownTimer).toBe(e.combat.skills[0].config.cooldown)
        e.stateMachine.setInput(0, 0, false, false, false, 0, 0)
        run(e.stateMachine, e, 60)
        expect(e.stateMachine.currentState).toBe('idle')
        expect(e.combat.skills[0].cooldownTimer).toBeGreaterThan(0)
        /* 点按仍可起手（tap 槽冷却独立） */
        e.stateMachine.setInput(0, 0, false, true, false, 0, 0)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('attacking')
        expect(e.combat.currentSkillIndex).toBe(1)
    })
})

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
        // Access body mock state to set linvel
        const b = e.body as unknown as {setLinvel: (v: {x: number; y: number; z: number}) => void; linvel: () => {x: number; y: number; z: number}}
        b.setLinvel({x: 5, y: -3, z: 0})
        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        const v = b.linvel()
        const n = e.groundNormal
        const dot = v.x * n.x + v.y * n.y + v.z * n.z
        expect(Math.abs(dot)).toBeLessThan(0.001)
    })

    it('总速度（含 vy）钳制在 2×speed 内', () => {
        const e = makeMock()
        enterFalling(e)
        e.isOnGround = false
        const b = e.body as unknown as {setLinvel: (v: {x: number; y: number; z: number}) => void; linvel: () => {x: number; y: number; z: number}}
        b.setLinvel({x: 15, y: -20, z: 0})
        e.stateMachine.update(DT, e)
        const v = b.linvel()
        expect(Math.hypot(v.x, v.y, v.z)).toBeLessThanOrEqual(12 + 0.001)
    })

    it('贴墙接触（ny ≤ FALL_SLIDE_MIN_NY）不投影，保留下落速度', () => {
        const e = makeMock()
        enterFalling(e)
        e.isOnGround = true
        e.groundNormal = {x: 0, y: 0.15, z: 0.9887}
        const b = e.body as unknown as {setLinvel: (v: {x: number; y: number; z: number}) => void; linvel: () => {x: number; y: number; z: number}}
        b.setLinvel({x: 0, y: -3, z: 0})
        e.stateMachine.update(DT, e)
        expect(b.linvel().y).toBeCloseTo(-3, 5)
    })

    it('陡坡接触（ny > FALL_SLIDE_MIN_NY）投影滑动 v·n = 0', () => {
        const e = makeMock()
        enterFalling(e)
        e.isOnGround = true
        e.groundNormal = {x: 0, y: 0.4, z: 0.9165}
        const b = e.body as unknown as {setLinvel: (v: {x: number; y: number; z: number}) => void; linvel: () => {x: number; y: number; z: number}}
        b.setLinvel({x: 5, y: -3, z: 0})
        e.stateMachine.setInput(0, 0, false, false)
        e.stateMachine.update(DT, e)
        const v = b.linvel()
        const n = e.groundNormal
        const dot = v.x * n.x + v.y * n.y + v.z * n.z
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
        /* 松开攻击键：无缓冲，当前段播完后收招 */
        e.stateMachine.setInput(1, 0, false, false, false, 0)
        run(e.stateMachine, e, 30)
        expect(e.stateMachine.currentState).toBe('falling')
    })

    it('attacking 在平地攻击结束进入 walking', () => {
        const e = makeMock()
        e.stateMachine.setInput(0, 0, false, true, false, 0)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('attacking')
        e.stateMachine.setInput(1, 0, false, false, false, 0)
        run(e.stateMachine, e, 30)
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

    it('dashing 在平地冲刺结束进入 walking，起手即挂冲刺冷却', () => {
        const e = makeMock()
        e.stateMachine.setInput(1, 0, false, false, true)
        e.stateMachine.update(DT, e)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('dashing')
        expect(e.combat.dashSkill.cooldownTimer).toBe(DASH_COOLDOWN)
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
        const b = e.body as unknown as {setLinvel: (v: {x: number; y: number; z: number}) => void; linvel: () => {x: number; y: number; z: number}}
        for (let i = 0; i < 60; i++) {
            /* 模拟物理引擎每帧沿坡灌入的重力速度 */
            b.setLinvel({x: 0.1, y: -0.05, z: 0})
            e.stateMachine.update(DT, e)
            expect(e.stateMachine.currentState).toBe('idle')
            const v = b.linvel()
            expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(0, 6)
        }
    })

    it('attacking 在可站立斜坡上逐帧清零物理灌入的速度', () => {
        const e = makeMock()
        e.isOnGround = true
        e.groundNormal = {x: 0, y: 0.6, z: 0.8}
        e.stateMachine.setInput(0, 0, false, true, false, 0)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('attacking')
        /* 松开攻击键避免缓冲连段，仅验证段内速度清零 */
        e.stateMachine.setInput(0, 0, false, false, false, 0)
        const b = e.body as unknown as {setLinvel: (v: {x: number; y: number; z: number}) => void; linvel: () => {x: number; y: number; z: number}}
        for (let i = 0; i < 12; i++) {
            b.setLinvel({x: 0.1, y: -0.05, z: 0})
            e.stateMachine.update(DT, e)
            const v = b.linvel()
            expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(0, 6)
        }
    })

    it('idle 无支撑时保留阻尼衰减（不误清速度）', () => {
        const e = makeMock()
        e.isOnGround = false
        const b = e.body as unknown as {setLinvel: (v: {x: number; y: number; z: number}) => void; linvel: () => {x: number; y: number; z: number}}
        b.setLinvel({x: 3, y: 0, z: 0})
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('idle')
        expect(b.linvel().x).toBeCloseTo(3 * 0.85, 5)
        expect(b.linvel().y).toBe(0)
    })
})

describe('跳跃', () => {
    it('跳跃顶点（vy ≤ 0）进入 falling', () => {
        const e = makeMock()
        e.stateMachine.setInput(0, 0, true, false)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('jumping')
        const b = e.body as unknown as {setLinvel: (v: {x: number; y: number; z: number}) => void; linvel: () => {x: number; y: number; z: number}}
        b.setLinvel({x: 0, y: -1, z: 0})
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
        const b = e.body as unknown as {setLinvel: (v: {x: number; y: number; z: number}) => void; linvel: () => {x: number; y: number; z: number}}
        for (let i = 0; i < 30; i++) {
            const v = b.linvel()
            b.setLinvel({x: v.x, y: v.y - 9.82 * DT, z: v.z})
            e.stateMachine.update(DT, e)
            expect(b.linvel().y).toBeGreaterThan(0)
            expect(e.stateMachine.currentState).toBe('jumping')
        }
        /* 越过顶点后进入 falling */
        for (let i = 0; i < 60; i++) {
            const v = b.linvel()
            b.setLinvel({x: v.x, y: v.y - 9.82 * DT, z: v.z})
            e.stateMachine.update(DT, e)
            if (e.stateMachine.currentState !== 'jumping') break
        }
        expect(e.stateMachine.currentState).toBe('falling')
    })
})

describe('输入缓冲连段（轻/重双链）', () => {
    const enterAttacking = (e: CharacterEntity, skillIndex = 0): void => {
        e.stateMachine.setInput(0, 0, false, true, false, skillIndex)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('attacking')
    }

    /** 逐帧跑到 currentSkillIndex 为指定值（限帧防死循环） */
    const runUntilSkill = (e: CharacterEntity, idx: number, maxFrames = 90): void => {
        for (let i = 0; i < maxFrames && e.combat.currentSkillIndex !== idx; i++) {
            e.stateMachine.update(DT, e)
        }
    }

    it('段末才推进：段中不推进（即使缓冲存在）', () => {
        const e = makeMock()
        enterAttacking(e, 0)
        /* 持续按住轻击：缓冲恒有值 */
        e.stateMachine.setInput(0, 0, false, true, false, 0)
        run(e.stateMachine, e, 13)
        /* 段中（轻 1 总时长 0.4s = 动作 0.2s + 恢复 0.2s，动作已过、未到段末） */
        expect(e.combat.currentSkillIndex).toBe(0)
        expect(e.combat.phaseIndex).toBe(1)
        /* 段末推进到轻 2（链中下一段），不出 attacking 状态 */
        runUntilSkill(e, 2)
        expect(e.combat.currentSkillIndex).toBe(2)
        expect(e.stateMachine.currentState).toBe('attacking')
        /* 推进时计时器重置 */
        expect(e.combat.attackTimer).toBeLessThan(0.1)
    })

    it('缓冲缺失则当前段完整播完后收招', () => {
        const e = makeMock()
        enterAttacking(e, 0)
        e.stateMachine.setInput(0, 0, false, false, false, 0)
        run(e.stateMachine, e, 30)
        expect(e.stateMachine.currentState).toBe('idle')
        expect(e.combat.currentSkillIndex).toBe(0)
    })

    it('轻链无限循环：按住轻击 0→2→0', () => {
        const e = makeMock()
        enterAttacking(e, 0)
        e.stateMachine.setInput(0, 0, false, true, false, 0)
        runUntilSkill(e, 2)
        expect(e.combat.currentSkillIndex).toBe(2)
        runUntilSkill(e, 0)
        expect(e.combat.currentSkillIndex).toBe(0)
        expect(e.stateMachine.currentState).toBe('attacking')
    })

    it('普通攻击无冷却：起手/链中段冷却恒 0，链推进不受阻塞', () => {
        const e = makeMock()
        enterAttacking(e, 0)
        /* 普通攻击 cooldown = 0：触发时不挂冷却 */
        expect(e.combat.skills[0].cooldownTimer).toBe(0)
        e.stateMachine.setInput(0, 0, false, true, false, 0)
        runUntilSkill(e, 2)
        runUntilSkill(e, 0)
        /* 循环链回到轻 1：全程无冷却阻塞；轻 2（链中段）同样恒 0 */
        expect(e.combat.skills[0].cooldownTimer).toBe(0)
        expect(e.combat.skills[2].cooldownTimer).toBe(0)
    })

    it('中途按重击键：段末切到重链并更新起手槽', () => {
        const e = makeMock()
        enterAttacking(e, 0)
        /* 轻 1 段中改按重击键（槽 1） */
        e.stateMachine.setInput(0, 0, false, true, false, 1)
        runUntilSkill(e, 1)
        expect(e.combat.currentSkillIndex).toBe(1)
        expect(e.combat.chainEntryIndex).toBe(1)
        expect(e.stateMachine.currentState).toBe('attacking')
    })
})

describe('受击硬直与保护窗口', () => {
    const enterAttacking = (e: CharacterEntity): void => {
        e.stateMachine.setInput(0, 0, false, true, false, 0)
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('attacking')
    }

    it('默认阶段行为：移动输入驱动推进（速度 = config.speed × moveSpeedMultiplier）', () => {
        const e = makeMock()
        enterAttacking(e)
        /* 按住攻击同时推移动方向（镜像 AI attack 状态的 setInput(adx, adz, true)）；
         * 轻 1 strike 阶段 moveSpeedMultiplier = 0.3，speed = 6 → 1.8 */
        e.stateMachine.setInput(1, 0, false, true, false, 0)
        e.stateMachine.update(DT, e)
        const b = e.body as unknown as {linvel: () => {x: number; y: number; z: number}}
        expect(b.linvel().x).toBeCloseTo(6 * 0.3, 5)
        expect(e.stateMachine.currentState).toBe('attacking')
    })

    it('攻击中被击中（pendingFlinch）立即进入 flinching 并中断攻击', () => {
        const e = makeMock()
        enterAttacking(e)
        /* 持续按住攻击：若无硬直中断会走缓冲连段，验证硬直优先级更高 */
        e.stateMachine.setInput(0, 0, false, true, false, 0)
        e.combat.pendingFlinch = true
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('flinching')
        expect(e.combat.attackActive).toBe(false)
        expect(e.combat.bufferedSkillIndex).toBe(-1)
        expect(e.combat.pendingFlinch).toBe(false)
    })

    it('硬直播完退回 idle，退出时挂 FLINCH_IMMUNITY_DURATION 保护窗口', () => {
        const e = makeMock()
        enterAttacking(e)
        e.stateMachine.setInput(0, 0, false, false, false, 0)
        e.combat.pendingFlinch = true
        e.stateMachine.update(DT, e)
        expect(e.stateMachine.currentState).toBe('flinching')
        /* FLINCH_DURATION = 0.1s，逐帧跑到退出（限帧防死循环） */
        for (let i = 0; i < 30 && e.stateMachine.currentState === 'flinching'; i++) {
            e.stateMachine.update(DT, e)
        }
        expect(e.stateMachine.currentState).toBe('idle')
        /* 退出时挂免硬直窗口（状态机不递减，由 world 主循环递减），防无限连段锁死 */
        expect(e.combat.flinchImmunityTimer).toBeCloseTo(FLINCH_IMMUNITY_DURATION)
    })
})
