import {describe, it, expect} from 'vitest'
import {ATTACK_PRESETS} from './archetypes.ts'
import {findWeaponPreset} from './weapon/catalog.ts'
import {MELEE_WEAPON_PRESETS} from './weapon/melee_weapon.ts'
import {RANGED_WEAPON_PRESETS} from './weapon/ranged_weapon.ts'

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
        expect(MELEE_WEAPON_PRESETS.heavy_sword.detectionRange).toBeGreaterThan(MELEE_WEAPON_PRESETS.long_sword.detectionRange)
    })

    it('远程侦测范围大于近战', () => {
        expect(RANGED_WEAPON_PRESETS.longbow.detectionRange).toBeGreaterThan(MELEE_WEAPON_PRESETS.long_sword.detectionRange)
    })

    it('longbow idealRange 在 retreatRange 和 range 之间', () => {
        expect(RANGED_WEAPON_PRESETS.longbow.idealRange).toBeGreaterThan(RANGED_WEAPON_PRESETS.longbow.retreatRange)
        expect(RANGED_WEAPON_PRESETS.longbow.idealRange).toBeLessThan(RANGED_WEAPON_PRESETS.longbow.range)
    })
})
