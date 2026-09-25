import {describe, it, expect} from 'vitest'
import {
    ATTACK_PRESETS,
} from './archetypes.ts'
import {findWeaponPreset} from './weapon/catalog.ts'
import {MELEE_WEAPON_PRESETS} from './weapon/melee_weapon.ts'
import {RANGED_WEAPON_PRESETS} from './weapon/ranged_weapon.ts'

describe('ATTACK_PRESETS.melee', () => {
    it('weaponId 指向近战武器预设', () => {
        const weapon = findWeaponPreset(ATTACK_PRESETS.melee.weaponId)
        expect(weapon?.type).toBe('melee')
    })
    it('damage 为正数', () => {
        expect(ATTACK_PRESETS.melee.damage).toBeGreaterThan(0)
    })
    it('无冷却覆写（普通攻击节奏由动作/恢复时间形成）', () => {
        expect(ATTACK_PRESETS.melee.cooldown).toBeUndefined()
    })
})

describe('ATTACK_PRESETS.ranged', () => {
    it('weaponId 指向远程武器预设', () => {
        const weapon = findWeaponPreset(ATTACK_PRESETS.ranged.weaponId)
        expect(weapon?.type).toBe('ranged')
    })
    it('range 为正数', () => {
        expect(ATTACK_PRESETS.ranged.ranged?.range).toBeGreaterThan(0)
    })
    it('damage 为正数', () => {
        expect(ATTACK_PRESETS.ranged.damage).toBeGreaterThan(0)
    })
    it('bulletSpeed 为正数', () => {
        expect(ATTACK_PRESETS.ranged.ranged?.bulletSpeed).toBeGreaterThan(0)
    })
    it('bulletLifetime 为正数', () => {
        expect(ATTACK_PRESETS.ranged.ranged?.bulletLifetime).toBeGreaterThan(0)
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
