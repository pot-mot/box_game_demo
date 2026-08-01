import {describe, it, expect} from 'vitest'
import {RANGED_SKILL_PRESETS, type RangedSkillConfig} from './ranged_skill.ts'
import {RANGED_WEAPON_PRESETS} from '../weapon/ranged_weapon.ts'

const presets = Object.entries(RANGED_SKILL_PRESETS) as [string, RangedSkillConfig][]
const presetIds = presets.map(([key]) => key)

const skillWeaponMap: Record<string, string> = {
    longbow_shot: 'longbow',
    crossbow_bolt: 'crossbow',
    shotgun_blast: 'shotgun',
    staff_orb: 'staff',
    magic_wand_homing: 'magic_wand',
    throwing_axe_hurl: 'throwing_axe',
    grenade_throw: 'grenade',
    molotov_throw: 'molotov',
    throwing_dart_fling: 'throwing_dart',
}

describe('RANGED_SKILL_PRESETS', () => {
    it('包含 9 个技能', () => {
        expect(presets).toHaveLength(9)
    })

    it.each(presetIds)('%s 的 id 与 key 匹配', (key) => {
        expect(RANGED_SKILL_PRESETS[key].id).toBe(key)
    })

    it.each(presetIds)('%s 的 type 为 ranged', (key) => {
        expect(RANGED_SKILL_PRESETS[key].type).toBe('ranged')
    })

    it.each(presetIds)('%s 的 cooldown > 0', (key) => {
        expect(RANGED_SKILL_PRESETS[key].cooldown).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 duration > 0', (key) => {
        expect(RANGED_SKILL_PRESETS[key].duration).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 duration <= cooldown', (key) => {
        const s = RANGED_SKILL_PRESETS[key]
        expect(s.duration).toBeLessThanOrEqual(s.cooldown)
    })

    it.each(presetIds)('%s 的 weapon 引用正确的武器预设', (key) => {
        const skill = RANGED_SKILL_PRESETS[key]
        const expectedWeaponKey = skillWeaponMap[key]
        expect(skill.weapon).toBe(RANGED_WEAPON_PRESETS[expectedWeaponKey])
    })

    it('crossbow_bolt 冷却比 longbow_shot 长', () => {
        expect(RANGED_SKILL_PRESETS.crossbow_bolt.cooldown).toBeGreaterThan(RANGED_SKILL_PRESETS.longbow_shot.cooldown)
    })

    it('grenade_throw 冷却最长', () => {
        const cd = RANGED_SKILL_PRESETS.grenade_throw.cooldown
        for (const [, s] of presets) {
            expect(s.cooldown).toBeLessThanOrEqual(cd)
        }
    })

    it('throwing_dart_fling 冷却最短', () => {
        const cd = RANGED_SKILL_PRESETS.throwing_dart_fling.cooldown
        for (const [, s] of presets) {
            expect(s.cooldown).toBeGreaterThanOrEqual(cd)
        }
    })

    it('每个键名唯一', () => {
        const ids = presets.map(([, s]) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
