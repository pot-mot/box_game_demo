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

    it.each(presetIds)('%s 的 cooldown 为 0（普通攻击无冷却）', (key) => {
        expect(RANGED_SKILL_PRESETS[key].cooldown).toBe(0)
    })

    it.each(presetIds)('%s 的 duration > 0', (key) => {
        expect(RANGED_SKILL_PRESETS[key].duration).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 recovery 为 0（远程普通攻击无恢复段）', (key) => {
        expect(RANGED_SKILL_PRESETS[key].recovery).toBe(0)
    })

    it.each(presetIds)('%s 的 weapon 引用正确的武器预设', (key) => {
        const skill = RANGED_SKILL_PRESETS[key]
        const expectedWeaponKey = skillWeaponMap[key]
        expect(skill.weapon).toBe(RANGED_WEAPON_PRESETS[expectedWeaponKey])
    })

    it('crossbow_bolt 动作时间比 longbow_shot 短', () => {
        expect(RANGED_SKILL_PRESETS.crossbow_bolt.duration).toBeLessThan(RANGED_SKILL_PRESETS.longbow_shot.duration)
    })

    it('grenade_throw 动作时间最长', () => {
        const dur = RANGED_SKILL_PRESETS.grenade_throw.duration
        for (const [, s] of presets) {
            expect(s.duration).toBeLessThanOrEqual(dur)
        }
    })

    it('throwing_dart_fling 动作时间最短', () => {
        const dur = RANGED_SKILL_PRESETS.throwing_dart_fling.duration
        for (const [, s] of presets) {
            expect(s.duration).toBeGreaterThanOrEqual(dur)
        }
    })

    it('每个键名唯一', () => {
        const ids = presets.map(([, s]) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
