import {describe, expect, it} from 'vitest'
import {MELEE_HEAVY_DURATION, MELEE_HEAVY_RECOVERY, MELEE_LIGHT_DURATION, MELEE_LIGHT_RECOVERY} from '../../../../../character/weapon/melee_attacks.ts'
import {findWeaponPreset, weaponAttacksOf} from '../../../../../character/weapon/catalog.ts'
import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import {HORSE_BASE} from '../../horse/state/form_base.ts'
import {WOLF_BASE} from '../../wolf/state/form_base.ts'
import {WYVERN_BASE} from '../../wyvern/state/form_base.ts'

/** 龙 / 马 / 狼的移动与攻击动画统一减速到原来的 50%（时长 ×2） */
describe('兽形动画减速 50%', () => {
    const SLOWED_STATES = ['walking', 'sprinting', 'swimming', 'floating'] as const

    const baseStates: readonly {
        readonly id: string
        readonly animation: typeof WOLF_BASE.animation
        readonly expected: Readonly<Record<typeof SLOWED_STATES[number], number>>
    }[] = [
        {id: 'wolf', animation: WOLF_BASE.animation, expected: {walking: 1.4, sprinting: 1.0, swimming: 1.8, floating: 3.2}},
        {id: 'horse', animation: HORSE_BASE.animation, expected: {walking: 1.6, sprinting: 1.1, swimming: 2.0, floating: 3.6}},
        {id: 'wyvern', animation: WYVERN_BASE.animation, expected: {walking: 1.7, sprinting: 1.2, swimming: 2.0, floating: 2.0}},
    ]

    for (const form of baseStates) {
        for (const state of SLOWED_STATES) {
            it(`${form.id} ${state} 时长为原来的 2 倍`, () => {
                expect(form.animation[state].duration).toBeCloseTo(form.expected[state])
            })
        }
    }

    const weaponCases = [
        {id: 'wolf_bite', heavy: true},
        {id: 'wolf_claw', heavy: true},
        {id: 'wolf_short_sword', heavy: true},
        {id: 'wolf_long_sword', heavy: true},
        {id: 'wolf_claw_blade', heavy: true},
        {id: 'horse_iron_hoof', heavy: true},
        {id: 'wyvern_claw', heavy: false},
        {id: 'wyvern_wing_blade', heavy: false},
    ] as const

    const lightOf = (weaponId: string): AttackSegment => {
        const weapon = findWeaponPreset(weaponId)
        if (weapon === undefined) throw new Error(`${weaponId} 未注册`)
        const attacks = weaponAttacksOf(weapon)
        const segment = attacks.segments[attacks.chains.light.steps[0]!]
        if (segment === undefined) throw new Error(`${weaponId} 缺少轻击段`)
        return segment
    }

    for (const {id, heavy} of weaponCases) {
        it(`${id} 轻击段时长 ×2`, () => {
            const segment = lightOf(id)
            expect(segment.duration).toBeCloseTo(MELEE_LIGHT_DURATION * 2)
            expect(segment.recovery).toBeCloseTo(MELEE_LIGHT_RECOVERY * 2)
        })

        if (!heavy) continue
        it(`${id} 重击段时长 ×2`, () => {
            const weapon = findWeaponPreset(id)
            if (weapon === undefined) throw new Error(`${id} 未注册`)
            const attacks = weaponAttacksOf(weapon)
            const segment = attacks.segments[attacks.chains.heavy.steps[0]!]
            if (segment === undefined) throw new Error(`${id} 缺少重击段`)
            expect(segment.duration).toBeCloseTo(MELEE_HEAVY_DURATION * 2)
            expect(segment.recovery).toBeCloseTo(MELEE_HEAVY_RECOVERY * 2)
        })
    }
})
