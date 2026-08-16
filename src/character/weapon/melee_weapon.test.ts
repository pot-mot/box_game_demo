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

    it.each(presetIds)('%s 的 detectBox 尺寸分量为正、前缘在身体前方', (key) => {
        const {size, offset} = MELEE_WEAPON_PRESETS[key].detectBox
        expect(size.x).toBeGreaterThan(0)
        expect(size.y).toBeGreaterThan(0)
        expect(size.z).toBeGreaterThan(0)
        /* 前缘 = offset.z + size.z/2，须位于身体前方 */
        expect(offset.z + size.z / 2).toBeGreaterThan(0)
    })

    it('spear 的 detectBox 前缘最远（长杆武器攻击距离优势）', () => {
        const front = (w: MeleeWeaponConfig): number => w.detectBox.offset.z + w.detectBox.size.z / 2
        const spearFront = front(MELEE_WEAPON_PRESETS.spear)
        for (const [, w] of presets) {
            expect(front(w)).toBeLessThanOrEqual(spearFront)
        }
    })

    it('每个键名唯一', () => {
        const ids = presets.map(([, w]) => w.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})
