import {describe, it, expect} from 'vitest'
import {HOLD_MODES, isHoldMode} from './hold_mode.ts'
import {ALL_WEAPON_PRESETS, defaultHoldMode, supportsHoldMode, weaponAttacksOf, weaponHoldModes} from './catalog.ts'
import {orderedSegments} from './attack_chain.ts'
import {getAttackClipById} from '../../entity/character/appearance/clips/attack_clips.ts'

describe('持握模式枚举（hold_mode）', () => {
    it('三态：单持 / 双手共持 / 双持，运行时值可校验', () => {
        expect(HOLD_MODES).toEqual(['one_handed', 'two_handed', 'dual_wield'])
        expect(isHoldMode('one_handed')).toBe(true)
        expect(isHoldMode('two_handed')).toBe(true)
        expect(isHoldMode('dual_wield')).toBe(true)
        expect(isHoldMode('nope')).toBe(false)
        expect(isHoldMode(undefined)).toBe(false)
    })
})

describe('武器持握模式数组 + 攻击链 map', () => {
    it('每把武器至少声明一种持握模式，默认模式为数组首个', () => {
        for (const weapon of ALL_WEAPON_PRESETS) {
            const modes = weaponHoldModes(weapon)
            expect(modes.length, weapon.id).toBeGreaterThan(0)
            expect(defaultHoldMode(weapon)).toBe(modes[0])
            expect(supportsHoldMode(weapon, modes[0])).toBe(true)
        }
    })

    it('每把武器的默认模式都声明了攻击链（map 覆盖默认模式）', () => {
        for (const weapon of ALL_WEAPON_PRESETS) {
            const attacks = weaponAttacksOf(weapon)
            expect(orderedSegments(attacks).length, weapon.id).toBeGreaterThan(0)
        }
    })

    it('长剑支持单持 + 双手共持；双手模式未单独声明时回退默认模式攻击链', () => {
        const longSword = ALL_WEAPON_PRESETS.find(weapon => weapon.id === 'long_sword')!
        expect(weaponHoldModes(longSword)).toEqual(['one_handed', 'two_handed'])
        expect(weaponAttacksOf(longSword, 'two_handed')).toBe(weaponAttacksOf(longSword, 'one_handed'))
    })

    it('不支持的持握模式回退默认模式（不抛错）', () => {
        const shortSword = ALL_WEAPON_PRESETS.find(weapon => weapon.id === 'short_sword')!
        expect(weaponAttacksOf(shortSword, 'dual_wield')).toBe(weaponAttacksOf(shortSword))
    })
})

describe('攻击段动作组合（每个连段引用 pose）', () => {
    it('全部段都声明非空 poses，且每个 pose id 都能解析出骨骼关键帧', () => {
        for (const weapon of ALL_WEAPON_PRESETS) {
            for (const segment of orderedSegments(weaponAttacksOf(weapon))) {
                expect(segment.poses.length, segment.id).toBeGreaterThan(0)
                for (const pose of segment.poses) {
                    expect(getAttackClipById(pose.poseId).duration).toBeGreaterThan(0)
                }
            }
        }
    })
})
