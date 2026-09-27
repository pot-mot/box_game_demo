import {describe, it, expect} from 'vitest'
import {HOLD_MODES, isHoldMode} from './hold_mode.ts'
import {
    ALL_WEAPON_PRESETS,
    availableHoldModes,
    defaultHoldMode,
    isDualWieldPair,
    sameWeaponClass,
    supportsHoldMode,
    weaponAttacksOf,
    weaponHoldModes,
} from './catalog.ts'
import {orderedSegments} from './attack_chain.ts'
import {getAttackClipById} from '../../entity/character/appearance/clips/attack_clips.ts'

const MELEE_IDS = ['short_sword', 'long_sword', 'heavy_sword', 'spear', 'dual_axe', 'war_hammer']

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

    it('全部近战武器支持三种模式且默认单持；远程保持既有单/双手声明', () => {
        for (const weaponId of MELEE_IDS) {
            const weapon = ALL_WEAPON_PRESETS.find(candidate => candidate.id === weaponId)!
            expect(weaponHoldModes(weapon), weaponId).toEqual(['one_handed', 'two_handed', 'dual_wield'])
            expect(defaultHoldMode(weapon), weaponId).toBe('one_handed')
        }
    })

    it('每把武器的每种声明模式都声明了攻击链（map 覆盖全部模式）', () => {
        for (const weapon of ALL_WEAPON_PRESETS) {
            for (const mode of weaponHoldModes(weapon)) {
                const attacks = weaponAttacksOf(weapon, mode)
                expect(orderedSegments(attacks).length, `${weapon.id}/${mode}`).toBeGreaterThan(0)
            }
        }
    })

    it('长剑双手模式拥有独立攻击链（不再是单持链回退）', () => {
        const longSword = ALL_WEAPON_PRESETS.find(weapon => weapon.id === 'long_sword')!
        expect(weaponAttacksOf(longSword, 'two_handed')).not.toBe(weaponAttacksOf(longSword, 'one_handed'))
        expect(orderedSegments(weaponAttacksOf(longSword, 'two_handed'))[0].id).toBe('long_sword_two_handed_light_1')
        expect(orderedSegments(weaponAttacksOf(longSword, 'dual_wield'))[0].id).toBe('long_sword_dual_wield_light_1')
    })

    it('不支持的持握模式回退默认模式（不抛错）', () => {
        const longbow = ALL_WEAPON_PRESETS.find(weapon => weapon.id === 'longbow')!
        expect(weaponAttacksOf(longbow, 'dual_wield')).toBe(weaponAttacksOf(longbow))
    })
})

describe('武器类 / 模型与双持可用性', () => {
    it('当前每把武器的默认模型与武器类同名（classId = id）', () => {
        for (const weapon of ALL_WEAPON_PRESETS) {
            expect(weapon.classId, weapon.id).toBe(weapon.id)
        }
    })

    it('双持组合要求主/副手为同类近战武器', () => {
        const sword = ALL_WEAPON_PRESETS.find(weapon => weapon.id === 'long_sword')!
        const otherSword = ALL_WEAPON_PRESETS.find(weapon => weapon.id === 'short_sword')!
        const axe = ALL_WEAPON_PRESETS.find(weapon => weapon.id === 'dual_axe')!
        const bow = ALL_WEAPON_PRESETS.find(weapon => weapon.id === 'longbow')!
        expect(sameWeaponClass(sword, sword)).toBe(true)
        expect(sameWeaponClass(sword, otherSword)).toBe(false)
        expect(isDualWieldPair(sword, sword)).toBe(true)
        expect(isDualWieldPair(sword, axe)).toBe(false)
        expect(isDualWieldPair(sword, bow)).toBe(false)
        expect(isDualWieldPair(sword, undefined)).toBe(false)
    })

    it('availableHoldModes：双持仅在副手同类近战时可用', () => {
        const sword = ALL_WEAPON_PRESETS.find(weapon => weapon.id === 'long_sword')!
        expect(availableHoldModes(sword, undefined)).toEqual(['one_handed', 'two_handed'])
        expect(availableHoldModes(sword, sword)).toEqual(['one_handed', 'two_handed', 'dual_wield'])
        const bow = ALL_WEAPON_PRESETS.find(weapon => weapon.id === 'longbow')!
        expect(availableHoldModes(bow, undefined)).toEqual(['two_handed'])
    })
})

describe('攻击段动作组合（每个连段引用 pose）', () => {
    it('全部武器全部模式的段都声明非空 poses，且每个 pose id 都能解析出骨骼关键帧', () => {
        for (const weapon of ALL_WEAPON_PRESETS) {
            for (const mode of weaponHoldModes(weapon)) {
                for (const segment of orderedSegments(weaponAttacksOf(weapon, mode))) {
                    expect(segment.poses.length, segment.id).toBeGreaterThan(0)
                    for (const pose of segment.poses) {
                        expect(getAttackClipById(pose.poseId).duration).toBeGreaterThan(0)
                    }
                }
            }
        }
    })
})
