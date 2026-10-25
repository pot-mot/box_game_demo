import {describe, it, expect} from 'vitest'
import {isTwoHandedWeapon, resolveAutoWeapon, weaponSpecOf} from './weapon_control.ts'
import {DEFAULT_WEAPON_ID, findWeaponPreset} from '../../character/weapon/catalog.ts'

describe('编辑器武器规格（weaponSpecOf / isTwoHandedWeapon）', () => {
    it('双手判定按显式持握模式，缺省取武器默认模式（近战默认单持）', () => {
        const shortSword = findWeaponPreset('short_sword')!
        const heavySword = findWeaponPreset('heavy_sword')!
        const spear = findWeaponPreset('spear')!
        const longbow = findWeaponPreset('longbow')!
        expect(isTwoHandedWeapon(shortSword)).toBe(false)
        /* 近战默认单持：不显式给模式时不是双手 */
        expect(isTwoHandedWeapon(heavySword)).toBe(false)
        expect(isTwoHandedWeapon(heavySword, 'two_handed')).toBe(true)
        expect(isTwoHandedWeapon(spear, 'two_handed')).toBe(true)
        /* 远程默认即双手 */
        expect(isTwoHandedWeapon(longbow)).toBe(true)
    })

    it('武器规格含网格与双手标记；双持模式附带同类副手网格；未知武器 id 返回 undefined', () => {
        const spec = weaponSpecOf('heavy_sword', 'two_handed')!
        expect(spec.weaponId).toBe('heavy_sword')
        expect(spec.meshConfig.id).toBe('heavy_sword')
        expect(spec.twoHanded).toBe(true)
        expect(spec.offhandMeshConfig).toBeUndefined()

        const dual = weaponSpecOf('long_sword', 'dual_wield')!
        expect(dual.twoHanded).toBe(false)
        expect(dual.offhandMeshConfig).toMatchObject({id: 'sword'})

        expect(weaponSpecOf('nope')).toBeUndefined()
    })

    it('「自动」模式解析：攻击动作 → 该武器（带段所属持握模式）；空手变体 → 卸下；无来源 → 保留当前，无当前则默认武器', () => {
        const fallback = weaponSpecOf(DEFAULT_WEAPON_ID, undefined, 'humanoid')
        /* 攻击动作（含内置副本）→ 该武器 + 段所属持握模式 */
        const spearSpec = resolveAutoWeapon(
            {weaponId: 'spear', segmentId: 'spear_two_handed_light_1', attackModule: 'two_handed'},
            undefined,
            fallback,
            'humanoid',
        )
        expect(spearSpec?.weaponId).toBe('spear')
        expect(spearSpec?.twoHanded).toBe(true)
        /* 空手变体 → 卸下武器 */
        expect(resolveAutoWeapon({weaponHeld: false}, weaponSpecOf('heavy_sword'), fallback, 'humanoid')).toBeUndefined()
        /* 持械变体 / 无来源动画（自定义动画、跳跃等）→ 保留当前武器 */
        expect(resolveAutoWeapon({weaponHeld: true}, weaponSpecOf('heavy_sword'), fallback, 'humanoid')?.weaponId).toBe('heavy_sword')
        expect(resolveAutoWeapon({}, weaponSpecOf('short_sword'), fallback, 'humanoid')?.weaponId).toBe('short_sword')
        /* 无当前武器 → 体形默认武器（避免「武器没出来」） */
        expect(resolveAutoWeapon({}, undefined, fallback, 'humanoid')?.weaponId).toBe(DEFAULT_WEAPON_ID)
    })

    it('武器属于其他体形时不会被「自动」模式采用，回退当前体形默认武器', () => {
        const wolfFallback = weaponSpecOf('wolf_bite', undefined, 'wolf')
        expect(resolveAutoWeapon({weaponId: 'long_sword'}, undefined, wolfFallback, 'wolf')?.weaponId).toBe('wolf_bite')
    })
})
