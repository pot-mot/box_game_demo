import {describe, it, expect} from 'vitest'
import {
    ATTACK_PRESETS,
} from './archetypes.ts'
import {MELEE_WEAPON_PRESETS} from './weapon/melee_weapon.ts'
import {RANGED_WEAPON_PRESETS} from './weapon/ranged_weapon.ts'

describe('ATTACK_PRESETS.melee', () => {
    it('type 为 melee', () => {
        expect(ATTACK_PRESETS.melee.type).toBe('melee')
    })
    it('range 为正数', () => {
        expect(ATTACK_PRESETS.melee.range).toBeGreaterThan(0)
    })
    it('damage 为正数', () => {
        expect(ATTACK_PRESETS.melee.damage).toBeGreaterThan(0)
    })
    it('cooldown 为正数', () => {
        expect(ATTACK_PRESETS.melee.cooldown).toBeGreaterThan(0)
    })
    it('duration 为正数', () => {
        expect(ATTACK_PRESETS.melee.duration).toBeGreaterThan(0)
    })
})

describe('ATTACK_PRESETS.ranged', () => {
    it('type 为 ranged', () => {
        expect(ATTACK_PRESETS.ranged.type).toBe('ranged')
    })
    it('range 大于近战', () => {
        expect(ATTACK_PRESETS.ranged.range).toBeGreaterThan(ATTACK_PRESETS.melee.range)
    })
    it('damage 为正数', () => {
        expect(ATTACK_PRESETS.ranged.damage).toBeGreaterThan(0)
    })
    it('bulletSpeed 为正数', () => {
        expect(ATTACK_PRESETS.ranged.bulletSpeed).toBeGreaterThan(0)
    })
    it('bulletLifetime 为正数', () => {
        expect(ATTACK_PRESETS.ranged.bulletLifetime).toBeGreaterThan(0)
    })
})

describe('MELEE_WEAPON_PRESETS', () => {
    it('detectionRange 为正数', () => {
        expect(MELEE_WEAPON_PRESETS.long_sword.detectionRange).toBeGreaterThan(0)
    })
    it('heavy_sword detectionRange 大于 long_sword', () => {
        expect(MELEE_WEAPON_PRESETS.heavy_sword.detectionRange).toBeGreaterThan(MELEE_WEAPON_PRESETS.long_sword.detectionRange)
    })
})

describe('RANGED_WEAPON_PRESETS', () => {
    it('detectionRange 大于近战', () => {
        expect(RANGED_WEAPON_PRESETS.longbow.detectionRange).toBeGreaterThan(MELEE_WEAPON_PRESETS.long_sword.detectionRange)
    })
    it('idealRange 在 retreatRange 和 range 之间', () => {
        expect(RANGED_WEAPON_PRESETS.longbow.idealRange).toBeGreaterThan(RANGED_WEAPON_PRESETS.longbow.retreatRange)
        expect(RANGED_WEAPON_PRESETS.longbow.idealRange).toBeLessThan(RANGED_WEAPON_PRESETS.longbow.range)
    })
})
