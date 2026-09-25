import {describe, it, expect} from 'vitest'
import {
    COLLISION_CATEGORY_VALUES,
    COLLISION_CATEGORY_BIT,
    categoryCollisionGroups,
    collisionCategoryMask,
    collisionCategoryOf,
    isBlockingGeometry,
    maskIncludesCategory,
    matchesCategoryMask,
    membershipOf,
} from './collision_category.ts'
import {
    DEFAULT_COLLISION_GROUP,
    DEFAULT_COLLISION_MASK,
    FRAGMENT_COLLISION_GROUP,
    FRAGMENT_COLLISION_MASK,
    TERRAIN_COLLISION_GROUP,
    TERRAIN_COLLISION_MASK,
} from './constants.ts'
import {CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK} from '../entity/character/constants.ts'
import {BULLET_COLLISION_GROUP, BULLET_COLLISION_MASK, WEAPON_COLLISION_GROUP, WEAPON_COLLISION_MASK} from '../entity/character/combat/constants.ts'

describe('collision_category 打包与解析', () => {
    it('类别位并入 membership，交互掩码原样保留', () => {
        const groups = categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'box')
        expect(membershipOf(groups) & DEFAULT_COLLISION_GROUP).toBe(DEFAULT_COLLISION_GROUP)
        expect(membershipOf(groups) & COLLISION_CATEGORY_BIT.box).toBe(COLLISION_CATEGORY_BIT.box)
        expect(groups & 0xFFFF).toBe(DEFAULT_COLLISION_MASK & 0xFFFF)
    })

    it('全部类别可往返解析', () => {
        for (const category of COLLISION_CATEGORY_VALUES) {
            const groups = categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, category)
            expect(collisionCategoryOf(groups)).toBe(category)
        }
    })

    it('类别位互不相同且落在高 16 位之外的低位交互组之上', () => {
        const bits = COLLISION_CATEGORY_VALUES.map(c => COLLISION_CATEGORY_BIT[c])
        expect(new Set(bits).size).toBe(bits.length)
        for (const bit of bits) {
            expect(bit).toBeGreaterThan(WEAPON_COLLISION_GROUP)
            expect(bit).toBeLessThan(0x10000)
        }
    })

    it('未标注类别的碰撞体（武器 / 投掷物）解析为 undefined', () => {
        expect(collisionCategoryOf((WEAPON_COLLISION_GROUP << 16) | (WEAPON_COLLISION_MASK & 0xFFFF))).toBeUndefined()
        expect(collisionCategoryOf((BULLET_COLLISION_GROUP << 16) | (BULLET_COLLISION_MASK & 0xFFFF))).toBeUndefined()
    })

    it('未显式声明碰撞组的碰撞体按 fail-closed 处理（默认 membership 全 1 = 已标注类别，会阻挡投掷物）', () => {
        expect(isBlockingGeometry(0xFFFFFFFF)).toBe(true)
    })

    it('类别掩码编译与匹配', () => {
        const mask = collisionCategoryMask(['area'])
        expect(mask).toBe(COLLISION_CATEGORY_BIT.area)
        expect(maskIncludesCategory(mask, 'area')).toBe(true)
        expect(maskIncludesCategory(mask, 'box')).toBe(false)
        expect(matchesCategoryMask(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'area'), mask)).toBe(true)
        expect(matchesCategoryMask(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'box'), mask)).toBe(false)
    })

    it('空掩码不匹配任何类别（子弹可穿过列表为空 = 命中任何已标注类别都消失）', () => {
        const empty = collisionCategoryMask([])
        for (const category of COLLISION_CATEGORY_VALUES) {
            expect(maskIncludesCategory(empty, category)).toBe(false)
            expect(matchesCategoryMask(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, category), empty)).toBe(false)
        }
    })
})

describe('isBlockingGeometry（形状扫描的阻挡候选）', () => {
    it('场景几何（箱子 / 碎片 / 地形 / 世界地面 / 水域）均阻挡', () => {
        expect(isBlockingGeometry(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'box'))).toBe(true)
        expect(isBlockingGeometry(categoryCollisionGroups(FRAGMENT_COLLISION_GROUP, FRAGMENT_COLLISION_MASK, 'fragment'))).toBe(true)
        expect(isBlockingGeometry(categoryCollisionGroups(TERRAIN_COLLISION_GROUP, TERRAIN_COLLISION_MASK, 'terrain'))).toBe(true)
        expect(isBlockingGeometry(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'ground'))).toBe(true)
        expect(isBlockingGeometry(categoryCollisionGroups(DEFAULT_COLLISION_GROUP, DEFAULT_COLLISION_MASK, 'area'))).toBe(true)
    })

    it('角色与未标注类别的碰撞体不参与形状扫描', () => {
        expect(isBlockingGeometry(categoryCollisionGroups(CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK, 'character'))).toBe(false)
        expect(isBlockingGeometry((BULLET_COLLISION_GROUP << 16) | (BULLET_COLLISION_MASK & 0xFFFF))).toBe(false)
        expect(isBlockingGeometry((WEAPON_COLLISION_GROUP << 16) | (WEAPON_COLLISION_MASK & 0xFFFF))).toBe(false)
    })
})
