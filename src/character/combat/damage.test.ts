import {describe, it, expect} from 'vitest'
import {applyDamage, type DamageEvent} from './damage.ts'
import {MIN_DAMAGE} from './constants.ts'
import {addDamageProfiles, reduceByDefense, ZERO_PROFILE, type DefenseProfile} from './defense.ts'

/** 最小伤害目标替身：仅含 applyDamage 读取的字段（defense 可选 = 不结算减伤） */
const makeTarget = (overrides?: {
    readonly health?: number
    readonly defense?: DefenseProfile
    readonly damageModifiers?: readonly ((event: DamageEvent) => DamageEvent)[]
}) => ({
    health: overrides?.health ?? 100,
    maxHealth: 100,
    ...(overrides?.defense !== undefined ? {defense: overrides.defense} : {}),
    ...(overrides?.damageModifiers !== undefined ? {damageModifiers: overrides.damageModifiers} : {}),
    onDamageTaken: null,
    onDeath: null,
})

const makeEvent = (overrides?: Partial<DamageEvent>): DamageEvent => ({
    sourceId: 1,
    targetId: 2,
    damageType: 'physical',
    baseAmount: 10,
    finalAmount: 10,
    skillId: 'test',
    ...overrides,
})

describe('applyDamage 防御结算', () => {
    it('按攻击类别取对应防御：物理防御不减免魔法伤害', () => {
        const physicalTarget = makeTarget({defense: {physical: 3, magic: 0}})
        applyDamage(physicalTarget, makeEvent())
        expect(physicalTarget.health).toBe(93)

        const magicTarget = makeTarget({defense: {physical: 3, magic: 0}})
        applyDamage(magicTarget, makeEvent({damageType: 'magic'}))
        expect(magicTarget.health).toBe(90)
    })

    it('固定减伤有最小 1 点保底（高防不会完全免疫）', () => {
        const target = makeTarget({defense: {physical: 50, magic: 50}})
        const result = applyDamage(target, makeEvent())
        expect(result.finalAmount).toBe(MIN_DAMAGE)
        expect(target.health).toBe(99)
    })

    it('baseAmount 保持原始伤害，finalAmount 为减免后实际扣血', () => {
        const target = makeTarget({defense: {physical: 4, magic: 0}})
        const result = applyDamage(target, makeEvent())
        expect(result.baseAmount).toBe(10)
        expect(result.finalAmount).toBe(6)
    })

    it('目标未提供 defense 时不结算减伤（旧测试替身兼容）', () => {
        const target = makeTarget()
        applyDamage(target, makeEvent())
        expect(target.health).toBe(90)
    })

    it('伤害修饰器先结算，防御在最后一步固定减免（不可被修饰器绕过）', () => {
        const target = makeTarget({
            defense: {physical: 2, magic: 0},
            damageModifiers: [event => ({...event, finalAmount: event.finalAmount * 2})],
        })
        const result = applyDamage(target, makeEvent())
        /* 修饰器后 20，再减 2 = 18 */
        expect(result.finalAmount).toBe(18)
        expect(target.health).toBe(82)
    })

    it('零/负伤害不触发最小伤害托底', () => {
        const target = makeTarget({defense: {physical: 5, magic: 0}})
        const result = applyDamage(target, makeEvent({baseAmount: 0, finalAmount: 0}))
        expect(result.finalAmount).toBe(0)
        expect(target.health).toBe(100)
    })

    it('低于 1 点的正伤害保持原值（最小伤害不放大原始伤害）', () => {
        const target = makeTarget({defense: {physical: 0, magic: 0}})
        const result = applyDamage(target, makeEvent({baseAmount: 0.5, finalAmount: 0.5}))
        expect(result.finalAmount).toBe(0.5)
        expect(target.health).toBeCloseTo(99.5)
    })

    it('返回事件保留方向与技能字段（含减免后的 finalAmount）', () => {
        const target = makeTarget({defense: {physical: 1, magic: 0}})
        const result = applyDamage(target, makeEvent({dirX: 0.6, dirZ: 0.8, skillId: 'spear_two_handed_light_1'}))
        expect(result.dirX).toBe(0.6)
        expect(result.dirZ).toBe(0.8)
        expect(result.skillId).toBe('spear_two_handed_light_1')
        expect(result.finalAmount).toBe(9)
    })

    it('翻滚无敌帧（invincibleTimer > 0）完全免疫：不扣血、不触发受击回调、不判死', () => {
        let taken = 0
        let died = false
        const target = {
            health: 1,
            maxHealth: 100,
            invincibleTimer: 0.2,
            onDamageTaken: () => { taken++ },
            onDeath: () => { died = true },
        }
        const result = applyDamage(target, makeEvent())
        expect(result.finalAmount).toBe(0)
        expect(target.health).toBe(1)
        expect(taken).toBe(0)
        expect(died).toBe(false)
    })

    it('无敌计时归零后恢复结算（含防御减伤）', () => {
        const target = {
            health: 100,
            maxHealth: 100,
            invincibleTimer: 0,
            defense: {physical: 3, magic: 0},
            onDamageTaken: null,
            onDeath: null,
        }
        const result = applyDamage(target, makeEvent())
        expect(result.finalAmount).toBe(7)
        expect(target.health).toBe(93)
    })
})

describe('防御工具函数', () => {
    it('addDamageProfiles 逐类别求和且不修改入参', () => {
        const a = {physical: 1, magic: 2}
        const b = {physical: 3, magic: 4}
        expect(addDamageProfiles(a, b)).toEqual({physical: 4, magic: 6})
        expect(a).toEqual({physical: 1, magic: 2})
    })

    it('reduceByDefense 固定减伤并保底 MIN_DAMAGE', () => {
        expect(reduceByDefense(10, 3)).toBe(7)
        expect(reduceByDefense(1, 3)).toBe(MIN_DAMAGE)
        expect(reduceByDefense(0, 3)).toBe(0)
        expect(reduceByDefense(-2, 3)).toBe(-2)
    })

    it('reduceByDefense 不放大低于 MIN_DAMAGE 的原始伤害', () => {
        expect(reduceByDefense(0.5, 0)).toBe(0.5)
        expect(reduceByDefense(0.5, 3)).toBe(0.5)
    })

    it('ZERO_PROFILE 为零值', () => {
        expect(ZERO_PROFILE).toEqual({physical: 0, magic: 0})
    })
})
