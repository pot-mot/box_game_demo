import {describe, it, expect} from 'vitest'
import {RANGED_WEAPON_PRESETS, type RangedWeaponConfig} from './ranged_weapon.ts'
import {MELEE_WEAPON_PRESETS} from './melee_weapon.ts'

const presets = Object.entries(RANGED_WEAPON_PRESETS) as [string, RangedWeaponConfig][]
const presetIds = presets.map(([key]) => key)

describe('RANGED_WEAPON_PRESETS', () => {
    it('包含 9 种武器', () => {
        expect(presets).toHaveLength(9)
    })

    it.each(presetIds)('%s 的 id 与 key 匹配', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].id).toBe(key)
    })

    it.each(presetIds)('%s 的 type 为 ranged', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].type).toBe('ranged')
    })

    it.each(presetIds)('%s 的 damage > 0', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].damage).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 range > 0', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].range).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 projectileSpeed > 0', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].projectileSpeed).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 projectileLifetime > 0', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].projectileLifetime).toBeGreaterThan(0)
    })

    it.each(presetIds)('%s 的 idealRange 在 retreatRange 和 range 之间', (key) => {
        const w = RANGED_WEAPON_PRESETS[key]
        expect(w.idealRange).toBeGreaterThan(w.retreatRange)
        expect(w.idealRange).toBeLessThan(w.range)
    })

    it.each(presetIds)('%s 的 detectionRange >= range', (key) => {
        const w = RANGED_WEAPON_PRESETS[key]
        expect(w.detectionRange).toBeGreaterThanOrEqual(w.range)
    })

    it.each(presetIds)('%s 的 knockbackForce > 0', (key) => {
        expect(RANGED_WEAPON_PRESETS[key].knockbackForce).toBeGreaterThan(0)
    })

    it('shotgun 有 spreadCount=6 且 spreadAngle>0', () => {
        const s = RANGED_WEAPON_PRESETS.shotgun
        expect(s.spreadCount).toBe(6)
        expect(s.spreadAngle).toBeGreaterThan(0)
    })

    it('staff 有 explosionRadius>0', () => {
        expect(RANGED_WEAPON_PRESETS.staff.explosionRadius).toBeGreaterThan(0)
    })

    it('magic_wand 有 homingStrength>0', () => {
        expect(RANGED_WEAPON_PRESETS.magic_wand.homingStrength).toBeGreaterThan(0)
    })

    it('grenade 有 throwAngle>0 和 explosionRadius>0', () => {
        const g = RANGED_WEAPON_PRESETS.grenade
        expect(g.throwAngle).toBeGreaterThan(0)
        expect(g.explosionRadius).toBeGreaterThan(0)
    })

    it('远程侦测范围大于近战', () => {
        const meleeDet = MELEE_WEAPON_PRESETS.long_sword.detectionRange
        for (const [, w] of presets) {
            expect(w.detectionRange).toBeGreaterThanOrEqual(meleeDet)
        }
    })

    it('crossbow 弹速最快', () => {
        const cb = RANGED_WEAPON_PRESETS.crossbow.projectileSpeed
        for (const [, w] of presets) {
            expect(w.projectileSpeed).toBeLessThanOrEqual(cb)
        }
    })

    it('每个键名唯一', () => {
        const ids = presets.map(([, w]) => w.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
