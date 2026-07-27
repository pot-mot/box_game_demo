import {describe, it, expect} from 'vitest'
import {
    ATTACK_PRESETS,
    ATTACK_DEFAULT_MAX_HEALTH,
    ATTACK_DEFAULT_DETECTION_RANGE,
} from './archetypes.ts'

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

describe('默认血量', () => {
    it('近战血量大于远程', () => {
        expect(ATTACK_DEFAULT_MAX_HEALTH.melee).toBeGreaterThan(ATTACK_DEFAULT_MAX_HEALTH.ranged)
    })
})

describe('默认探测范围', () => {
    it('远程探测范围大于近战', () => {
        expect(ATTACK_DEFAULT_DETECTION_RANGE.ranged).toBeGreaterThan(ATTACK_DEFAULT_DETECTION_RANGE.melee)
    })
})
