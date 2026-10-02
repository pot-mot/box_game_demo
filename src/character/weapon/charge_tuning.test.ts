import {describe, it, expect} from 'vitest'
import {chargeDamageBonusOf, chargeDamageScale} from './charge_tuning.ts'
import {createWeaponRuntime} from './weapon_runtime.ts'
import {MELEE_WEAPON_MODELS, resolveMeleeWeapon} from './melee_weapon.ts'

/**
 * 蓄力调参：`maxChargeMultiplier`（%）与 `maxChargeTime`（s）成一次函数——
 * charge 0 → 100%，满蓄力 → maxChargeMultiplier%；来源为武器模板默认，单武器 / 角色面板可覆盖。
 */
describe('蓄力调参（一次函数）', () => {
    it('chargeDamageScale：0 → 100%，满蓄力 → maxChargeMultiplier%，且封顶', () => {
        const tuning = {maxChargeMultiplier: 300, maxChargeTime: 2}
        expect(chargeDamageScale(tuning, 0)).toBeCloseTo(1, 6)
        expect(chargeDamageScale(tuning, 0.5)).toBeCloseTo(2, 6)
        expect(chargeDamageScale(tuning, 1)).toBeCloseTo(3, 6)
        expect(chargeDamageScale(tuning, 2)).toBeCloseTo(3, 6)
        expect(chargeDamageBonusOf(tuning)).toBeCloseTo(2, 6)
    })

    it('单武器（模型）覆盖模板默认，并重烘焙攻击链可蓄力段', () => {
        const base = resolveMeleeWeapon(MELEE_WEAPON_MODELS.long_sword)
        const overridden = resolveMeleeWeapon({
            ...MELEE_WEAPON_MODELS.long_sword,
            charge: {maxChargeMultiplier: 300, maxChargeTime: 2},
        })
        expect(base.heavyCharge?.maxChargeMultiplier).toBe(200)
        expect(base.heavyCharge?.maxChargeTime).toBe(1)
        expect(overridden.heavyCharge?.maxChargeMultiplier).toBe(300)
        expect(overridden.heavyCharge?.maxChargeTime).toBe(2)

        const segment = overridden.attacks.one_handed!.segments['long_sword_one_handed_heavy_1']
        expect(segment.chargeFullTime).toBe(2)
        expect(segment.chargeDamageBonus).toBeCloseTo(2, 6)
    })

    it('角色面板覆写（createWeaponRuntime 的 charge）同步到武器与攻击链', () => {
        const runtime = createWeaponRuntime('long_sword', {charge: {maxChargeMultiplier: 300, maxChargeTime: 2}})
        if (runtime.weapon.type !== 'melee') throw new Error('long_sword 应为近战武器')
        expect(runtime.weapon.heavyCharge?.maxChargeMultiplier).toBe(300)
        expect(runtime.weapon.heavyCharge?.maxChargeTime).toBe(2)
        const segment = runtime.attacks.segments['long_sword_one_handed_heavy_1']
        expect(segment.chargeFullTime).toBe(2)
        expect(segment.chargeDamageBonus).toBeCloseTo(2, 6)
    })
})
