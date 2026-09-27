import {describe, it, expect} from 'vitest'
import {
    ALL_ARMOR_PRESETS,
    ARMOR_PRESETS,
    armorPiecesOfSlot,
    findArmorPreset,
    resolveArmorLoadout,
    totalAttackOf,
    totalDefenseOf,
    totalMoveSpeedOf,
} from './catalog.ts'
import {ARMOR_SLOTS} from './slots.ts'
import {ZERO_PROFILE} from '../combat/defense.ts'

describe('护甲目录', () => {
    it('全部预设：id 与键一致、槽位合法、中文名非空、防御 / 攻击加成非负、移速乘数为正', () => {
        expect(ALL_ARMOR_PRESETS.length).toBeGreaterThan(0)
        for (const [key, piece] of Object.entries(ARMOR_PRESETS)) {
            expect(piece.id).toBe(key)
            expect(ARMOR_SLOTS).toContain(piece.slot)
            expect(piece.name.length).toBeGreaterThan(0)
            expect(piece.name).toMatch(/^[\u4e00-\u9fa5]+$/)
            expect(piece.defense.physical).toBeGreaterThanOrEqual(0)
            expect(piece.defense.magic).toBeGreaterThanOrEqual(0)
            expect(piece.attack.physical).toBeGreaterThanOrEqual(0)
            expect(piece.attack.magic).toBeGreaterThanOrEqual(0)
            expect(piece.moveSpeedMultiplier).toBeGreaterThan(0)
        }
    })

    it('每个槽位都有可选护甲，且护甲 id 全局唯一', () => {
        for (const slot of ARMOR_SLOTS) {
            expect(armorPiecesOfSlot(slot).length).toBeGreaterThan(0)
        }
        const ids = ALL_ARMOR_PRESETS.map(piece => piece.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('四件满配数值护栏：逐类别防御 ≤ 9、攻击加成 ≤ 2（最小 1 点保底下轻武器仍有削血）', () => {
        let maxPhysicalDef = 0
        let maxMagicDef = 0
        let maxPhysicalAtk = 0
        let maxMagicAtk = 0
        for (const slot of ARMOR_SLOTS) {
            const pieces = armorPiecesOfSlot(slot)
            maxPhysicalDef += Math.max(...pieces.map(piece => piece.defense.physical))
            maxMagicDef += Math.max(...pieces.map(piece => piece.defense.magic))
            maxPhysicalAtk = Math.max(maxPhysicalAtk, ...pieces.map(piece => piece.attack.physical))
            maxMagicAtk = Math.max(maxMagicAtk, ...pieces.map(piece => piece.attack.magic))
        }
        expect(maxPhysicalDef).toBeGreaterThan(0)
        expect(maxMagicDef).toBeGreaterThan(0)
        expect(maxPhysicalDef).toBeLessThanOrEqual(9)
        expect(maxMagicDef).toBeLessThanOrEqual(9)
        expect(maxPhysicalAtk).toBeLessThanOrEqual(2)
        expect(maxMagicAtk).toBeLessThanOrEqual(2)
        expect(maxPhysicalAtk + maxMagicAtk).toBeGreaterThan(0)
    })

    it('法师系头盔提供法术攻击力（法师兜帽）', () => {
        expect(ARMOR_PRESETS.mage_hood.slot).toBe('head')
        expect(ARMOR_PRESETS.mage_hood.attack.magic).toBeGreaterThan(0)
    })

    it('重甲件减速、加速鞋增速', () => {
        expect(ARMOR_PRESETS.iron_helmet.moveSpeedMultiplier).toBeLessThan(1)
        expect(ARMOR_PRESETS.iron_plate.moveSpeedMultiplier).toBeLessThan(1)
        expect(ARMOR_PRESETS.iron_greaves.moveSpeedMultiplier).toBeLessThan(1)
        expect(ARMOR_PRESETS.battle_bracers.moveSpeedMultiplier).toBeLessThan(1)
        expect(ARMOR_PRESETS.swift_boots.moveSpeedMultiplier).toBeGreaterThan(1)
        expect(ARMOR_PRESETS.wind_boots.moveSpeedMultiplier).toBeGreaterThan(ARMOR_PRESETS.swift_boots.moveSpeedMultiplier)
    })

    it('findArmorPreset：未知 id / undefined 返回 undefined', () => {
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
