import {describe, it, expect} from 'vitest'
import {MELEE_SKILL_PRESETS, type MeleeSkillConfig} from './melee_skill.ts'
import {MELEE_WEAPON_PRESETS} from '../weapon/melee_weapon.ts'

const presets = Object.entries(MELEE_SKILL_PRESETS) as [string, MeleeSkillConfig][]
const presetIds = presets.map(([key]) => key)

/** 技能 key → 武器 key 映射 */
const skillWeaponMap: Record<string, string> = {
    short_sword_slash: 'short_sword',
    long_sword_slash: 'long_sword',
    heavy_sword_slam: 'heavy_sword',
    spear_thrust: 'spear',
    dual_axe_spin: 'dual_axe',
    war_hammer_smash: 'war_hammer',
}

describe('MELEE_SKILL_PRESETS', () => {
    it('包含 6 个技能', () => {
        expect(presets).toHaveLength(6)
    })

    it.each(presetIds)('%s 的 id 与 key 匹配', (key) => {
        expect(MELEE_SKILL_PRESETS[key].id).toBe(key)
    })

    it.each(presetIds)('%s 的 type 为 melee', (key) => {
        expect(MELEE_SKILL_PRESETS[key].type).toBe('melee')
    })

    it.each(presetIds)('%s 的 cooldown > 0', (key) => {
        expect(MELEE_SKILL_PRESETS[key].cooldown).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 duration > 0', (key) => {
        expect(MELEE_SKILL_PRESETS[key].duration).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 duration <= cooldown', (key) => {
        const s = MELEE_SKILL_PRESETS[key]
        expect(s.duration).toBeLessThanOrEqual(s.cooldown)
    })

    it.each(presetIds)('%s 的 weapon 引用正确的武器预设', (key) => {
        const skill = MELEE_SKILL_PRESETS[key]
        const expectedWeaponKey = skillWeaponMap[key]
        expect(skill.weapon).toBe(MELEE_WEAPON_PRESETS[expectedWeaponKey])
    })

    it('short_sword_slash 冷却最短', () => {
        const cd = MELEE_SKILL_PRESETS.short_sword_slash.cooldown
        for (const [, s] of presets) {
            expect(s.cooldown).toBeGreaterThanOrEqual(cd)
        }
    })

    it('war_hammer_smash 冷却最长', () => {
        const cd = MELEE_SKILL_PRESETS.war_hammer_smash.cooldown
        for (const [, s] of presets) {
            expect(s.cooldown).toBeLessThanOrEqual(cd)
        }
    })

    it('war_hammer_smash duration 最长', () => {
        const dur = MELEE_SKILL_PRESETS.war_hammer_smash.duration
        for (const [, s] of presets) {
            expect(s.duration).toBeLessThanOrEqual(dur)
        }
    })

    it('每个键名唯一', () => {
        const ids = presets.map(([, s]) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
