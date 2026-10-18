import {describe, it, expect} from 'vitest'
import {ATTACK_PRESETS} from './archetypes.ts'
import {findWeaponPreset} from './weapon/catalog.ts'

const heavySword = findWeaponPreset('heavy_sword')!
const longSword = findWeaponPreset('long_sword')!
const longbow = findWeaponPreset('longbow')!

describe('ATTACK_PRESETS 武器类别指向', () => {
    it('近战预设指向近战武器', () => {
        expect(findWeaponPreset(ATTACK_PRESETS.melee.weaponId)?.type).toBe('melee')
    })

    it('远程预设指向远程武器', () => {
        expect(findWeaponPreset(ATTACK_PRESETS.ranged.weaponId)?.type).toBe('ranged')
    })
})

describe('侦测范围关系', () => {
    it('heavy_sword detectionRange 大于 long_sword', () => {
        expect(heavySword.detectionRange).toBeGreaterThan(longSword.detectionRange)
    })

    it('远程侦测范围大于近战', () => {
        expect(longbow.type === 'ranged' ? longbow.detectionRange : 0).toBeGreaterThan(longSword.detectionRange)
    })

    it('longbow idealRange 在 retreatRange 和 range 之间', () => {
        if (longbow.type !== 'ranged') throw new Error('longbow 应为远程武器')
        expect(longbow.idealRange).toBeGreaterThan(longbow.retreatRange)
        expect(longbow.idealRange).toBeLessThan(longbow.range)
    })
})
