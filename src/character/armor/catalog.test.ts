import {describe, it, expect} from 'vitest'
import {
    findArmorPreset,
    resolveArmorLoadout,
    totalAttackOf,
    totalDefenseOf,
    totalMoveSpeedOf,
} from './catalog.ts'
import {ZERO_PROFILE} from '../combat/defense.ts'

describe('findArmorPreset', () => {
    it('未知 id / undefined 返回 undefined', () => {
        expect(findArmorPreset('iron_helmet')?.name).toBe('铁盔')
        expect(findArmorPreset('no_such_armor')).toBeUndefined()
        expect(findArmorPreset(undefined)).toBeUndefined()
    })
})

describe('resolveArmorLoadout（存档容错）', () => {
    it('合法装备表按槽位解析（四个槽位）', () => {
        const resolved = resolveArmorLoadout({
            head: 'iron_helmet', chest: 'iron_plate', arms: 'iron_bracers', legs: 'iron_greaves',
        })
        expect(resolved.head?.id).toBe('iron_helmet')
        expect(resolved.chest?.id).toBe('iron_plate')
        expect(resolved.arms?.id).toBe('iron_bracers')
        expect(resolved.legs?.id).toBe('iron_greaves')
    })

    it('未知 id 回退空槽（不抛错）', () => {
        const resolved = resolveArmorLoadout({head: 'no_such_armor', chest: 'iron_plate'})
        expect(resolved.head).toBeUndefined()
        expect(resolved.chest?.id).toBe('iron_plate')
    })

    it('槽位与护甲 id 不匹配时回退空槽（头盔 id 放护腿槽）', () => {
        const resolved = resolveArmorLoadout({legs: 'mage_hood'})
        expect(resolved.legs).toBeUndefined()
    })

    it('空 / undefined 装备表解析为空', () => {
        expect(resolveArmorLoadout(undefined)).toEqual({})
        expect(resolveArmorLoadout({})).toEqual({})
    })
})

describe('totalDefenseOf', () => {
    it('有效防御 = 基础防御 + 各槽位护甲之和', () => {
        const resolved = resolveArmorLoadout({head: 'iron_helmet', chest: 'iron_plate'})
        expect(totalDefenseOf({physical: 1, magic: 1}, resolved)).toEqual({physical: 6, magic: 1})
    })

    it('空装备表 = 基础防御', () => {
        expect(totalDefenseOf(ZERO_PROFILE, resolveArmorLoadout(undefined))).toEqual(ZERO_PROFILE)
        expect(totalDefenseOf({physical: 2, magic: 3}, {})).toEqual({physical: 2, magic: 3})
    })

    it('法系护甲叠加魔法防御', () => {
        const resolved = resolveArmorLoadout({head: 'mage_hood', chest: 'mage_robe', legs: 'mage_leggings'})
        expect(totalDefenseOf(ZERO_PROFILE, resolved)).toEqual({physical: 0, magic: 7})
    })
})

describe('totalAttackOf / totalMoveSpeedOf', () => {
    it('攻击加成 = 各槽位护甲攻击加成之和（按类别）', () => {
        const resolved = resolveArmorLoadout({head: 'mage_hood', arms: 'battle_bracers'})
        expect(totalAttackOf(resolved)).toEqual({physical: 2, magic: 1})
    })

    it('空装备表攻击加成为零', () => {
        expect(totalAttackOf(resolveArmorLoadout(undefined))).toEqual(ZERO_PROFILE)
    })

    it('移速乘数 = 各槽位护甲移速乘数之积', () => {
        const resolved = resolveArmorLoadout({chest: 'iron_plate', legs: 'swift_boots'})
        expect(totalMoveSpeedOf(resolved)).toBeCloseTo(0.9 * 1.15, 6)
    })

    it('空装备表移速乘数 = 1；重甲满配 < 1、加速鞋 > 1', () => {
        expect(totalMoveSpeedOf(resolveArmorLoadout(undefined))).toBe(1)
        const heavy = resolveArmorLoadout({
            head: 'iron_helmet', chest: 'iron_plate', arms: 'battle_bracers', legs: 'iron_greaves',
        })
        expect(totalMoveSpeedOf(heavy)).toBeLessThan(1)
        expect(totalMoveSpeedOf(resolveArmorLoadout({legs: 'wind_boots'}))).toBeGreaterThan(1)
    })
})
