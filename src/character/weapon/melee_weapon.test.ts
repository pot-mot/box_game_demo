import {describe, it, expect} from 'vitest'
import {MELEE_WEAPON_PRESETS, type MeleeWeaponConfig} from './melee_weapon.ts'

const presets = Object.entries(MELEE_WEAPON_PRESETS) as [string, MeleeWeaponConfig][]
const presetIds = presets.map(([key]) => key)

describe('MELEE_WEAPON_PRESETS', () => {
    it('包含 6 种武器', () => {
        expect(presets).toHaveLength(6)
    })

    it.each(presetIds)('%s 的 id 与 key 匹配', (key) => {
        expect(MELEE_WEAPON_PRESETS[key].id).toBe(key)
    })

    it.each(presetIds)('%s 的 type 为 melee', (key) => {
        expect(MELEE_WEAPON_PRESETS[key].type).toBe('melee')
    })

    it.each(presetIds)('%s 的 damage > 0', (key) => {
        expect(MELEE_WEAPON_PRESETS[key].damage).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 range > 0', (key) => {
        expect(MELEE_WEAPON_PRESETS[key].range).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 detectionRange >= range', (key) => {
        const w = MELEE_WEAPON_PRESETS[key]
        expect(w.detectionRange).toBeGreaterThanOrEqual(w.range)
    })

    it.each(presetIds)('%s 的 arcAngle 在 (0, PI*1.5] 之间', (key) => {
        const a = MELEE_WEAPON_PRESETS[key].arcAngle
        expect(a).toBeGreaterThan(0)
        expect(a).toBeLessThanOrEqual(Math.PI * 1.5)
    })

    it.each(presetIds)('%s 的 arcRadius > 0', (key) => {
        expect(MELEE_WEAPON_PRESETS[key].arcRadius).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 knockbackForce > 0', (key) => {
        expect(MELEE_WEAPON_PRESETS[key].knockbackForce).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 knockbackY > 0', (key) => {
        expect(MELEE_WEAPON_PRESETS[key].knockbackY).toBeGreaterThan(0)
    })

    it('war_hammer 伤害最高', () => {
        const hammer = MELEE_WEAPON_PRESETS.war_hammer.damage
        for (const [, w] of presets) {
            expect(w.damage).toBeLessThanOrEqual(hammer)
        }
    })

    it('spear 攻击距离最远', () => {
        const spear = MELEE_WEAPON_PRESETS.spear.range
        for (const [, w] of presets) {
            expect(w.range).toBeLessThanOrEqual(spear)
        }
    })

    it('dual_axe arcAngle 最宽', () => {
        const axe = MELEE_WEAPON_PRESETS.dual_axe.arcAngle
        for (const [, w] of presets) {
            expect(w.arcAngle).toBeLessThanOrEqual(axe)
        }
    })

    it('每个键名唯一', () => {
        const ids = presets.map(([, w]) => w.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
