import {describe, it, expect} from 'vitest'
import {weaponsOfForm} from '../../../character/weapon/catalog.ts'
import type {MeleeWeaponConfig} from '../../../character/weapon/melee_weapon.ts'
import type {MeleeDetectBoxSpec} from '../../../character/weapon/melee_weapon.ts'
import {HUMANOID_BODY_FORM_ID} from '../body_form/index.ts'

/** 检测箱前缘 = 盒中心 z + 半深（身体中心沿朝向到前方的距离，scale=1） */
const frontEdge = (box: MeleeDetectBoxSpec): number => box.offset.z + box.size.z / 2
const detectBoxOf = (weapon: MeleeWeaponConfig): MeleeDetectBoxSpec => weapon.detectBoxes[0]!

/* 人形近战武器（生物武器检测箱按体形语义，不参与人形范围序断言） */
const MELEE_WEAPON_PRESETS: Record<string, MeleeWeaponConfig> = Object.fromEntries(
    weaponsOfForm(HUMANOID_BODY_FORM_ID)
        .filter((w): w is MeleeWeaponConfig => w.type === 'melee')
        .map(w => [w.id, w]),
)

const presets = Object.entries(MELEE_WEAPON_PRESETS) as [string, MeleeWeaponConfig][]

describe('近战 detectBox 攻击范围关系', () => {
    it('攻击范围随武器长度递增：短剑 < 长剑 < 巨剑 < 长枪', () => {
        const order = ['short_sword', 'long_sword', 'heavy_sword', 'spear'] as const
        const fronts = order.map(id => frontEdge(detectBoxOf(MELEE_WEAPON_PRESETS[id]!)))
        for (let i = 1; i < fronts.length; i++) {
            expect(fronts[i], order[i]).toBeGreaterThan(fronts[i - 1])
        }
    })

    it('长枪前缘最远；战斧 / 战锤均远于短剑', () => {
        const spear = frontEdge(MELEE_WEAPON_PRESETS.spear.detectBoxes[0]!)
        for (const [, weapon] of presets) {
            expect(frontEdge(weapon.detectBoxes[0]!)).toBeLessThanOrEqual(spear)
        }
        expect(frontEdge(MELEE_WEAPON_PRESETS.war_hammer.detectBoxes[0]!))
            .toBeGreaterThan(frontEdge(MELEE_WEAPON_PRESETS.short_sword.detectBoxes[0]!))
        expect(frontEdge(MELEE_WEAPON_PRESETS.dual_axe.detectBoxes[0]!))
            .toBeGreaterThan(frontEdge(MELEE_WEAPON_PRESETS.short_sword.detectBoxes[0]!))
    })
})
