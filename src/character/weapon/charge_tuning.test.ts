import {describe, it, expect} from 'vitest'
import {chargeDamageBonusOf, chargeDamageScale} from './charge_tuning.ts'
import {createWeaponRuntime} from './weapon_runtime.ts'
import {meleeClass, resolveMeleeWeapon} from './melee_weapon.ts'

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
        const weaponClass = meleeClass({
            id: 'x', type: 'melee', damageType: 'physical', attackModules: [{id: 'one_handed', nameKey: 'hold_mode.one_handed', holdMode: 'one_handed'}],
            damage: 1, knockbackForce: 0, knockbackY: 0, detectionRange: 1,
            detectBoxes: [{jointId: 'root', size: {x: 0.1, y: 0.1, z: 0.1}, offset: {x: 0, y: 0.5, z: 0}, rotation: {x: 0, y: 0, z: 0}}],
        }, {one_handed: {}})
        const overridden = resolveMeleeWeapon(weaponClass, {
            id: 'x', classId: 'x', formId: 'humanoid', name: 'x', nameKey: 'weapon.unarmed',
            equipBodyParts: ['main_hand'], mesh: {id: 'none'},
            charge: {maxChargeMultiplier: 300, maxChargeTime: 2},
        })

        const segment = overridden.attacks.one_handed!.segments['x_one_handed_heavy_1']
        expect(segment.chargeFullTime).toBe(2)
        expect(segment.chargeDamageBonus).toBeCloseTo(2, 6)
    })

    it('角色面板覆写（createWeaponRuntime 的 charge）同步到武器与攻击链', () => {
        const runtime = createWeaponRuntime('long_sword', {charge: {maxChargeMultiplier: 300, maxChargeTime: 2}})
        if (runtime.weapon.type !== 'melee') throw new Error('long_sword 应为近战武器')
        const segment = runtime.attacks.segments['long_sword_one_handed_heavy_1']
        expect(segment.chargeFullTime).toBe(2)
        expect(segment.chargeDamageBonus).toBeCloseTo(2, 6)
    })

    it('近战重击蓄力时长下限 = 抬手段（2:1:2.5 中的「2」）：配置更短也完整播完前摇', () => {
        const segment = createWeaponRuntime('long_sword', {charge: {maxChargeTime: 0.2}})
            .attacks.segments['long_sword_one_handed_heavy_1']
        expect(segment.chargeFullTime).toBeCloseTo(0.48, 6)
    })

    it('蓄力时间为 0 时同样取前摇下限（不跳过前摇）', () => {
        const segment = createWeaponRuntime('long_sword', {charge: {maxChargeTime: 0}})
            .attacks.segments['long_sword_one_handed_heavy_1']
        expect(segment.chargeFullTime).toBeCloseTo(0.48, 6)
    })

    it('远程段不受前摇下限影响，直接取配置值', () => {
        const segment = createWeaponRuntime('longbow', {charge: {maxChargeTime: 0.3}})
            .attacks.segments['longbow_shot']
        expect(segment?.chargeFullTime).toBeCloseTo(0.3, 6)
    })
})
