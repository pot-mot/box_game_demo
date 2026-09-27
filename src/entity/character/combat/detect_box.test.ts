import {describe, it, expect} from 'vitest'
import {createWeaponMesh} from '../appearance/weapon_mesh.ts'
import {MELEE_WEAPON_PRESETS, type MeleeWeaponConfig} from '../../../character/weapon/melee_weapon.ts'
import type {MeleeDetectBox} from '../../../character/weapon/melee_weapon.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'
import {
    MELEE_ARM_FORWARD_REACH,
    MELEE_DETECT_SIDE_MARGIN,
    MELEE_DETECT_HEIGHT_MARGIN,
    MELEE_DETECT_BACK_MARGIN,
    MELEE_DETECT_MARGIN,
    MELEE_DETECT_FORWARD_SCALE,
} from './constants.ts'

/**
 * 出招检测箱估算（权威公式，见 `docs/ai_system.md` 2.5.1）：
 * 前缘 = (持械臂前伸量 + 武器命中箱 reach) × MELEE_DETECT_FORWARD_SCALE（前向收短）；
 * 侧向 / 竖直 = 角色碰撞箱 + 边距；身后保留贴背余量；最后每轴外扩 MELEE_DETECT_MARGIN（+0.05）。
 */
const estimateDetectBox = (weaponReach: number): MeleeDetectBox => {
    const front = (MELEE_ARM_FORWARD_REACH + weaponReach) * MELEE_DETECT_FORWARD_SCALE
    const back = MELEE_DETECT_BACK_MARGIN
    return {
        size: {
            x: CHARACTER_BASE_SIZE.width + 2 * MELEE_DETECT_SIDE_MARGIN + MELEE_DETECT_MARGIN,
            y: CHARACTER_BASE_SIZE.height + 2 * MELEE_DETECT_HEIGHT_MARGIN + MELEE_DETECT_MARGIN,
            z: front + back + MELEE_DETECT_MARGIN,
        },
        offset: {x: 0, y: 0, z: (front - back) / 2},
    }
}

/** 检测箱前缘 = 盒中心 z + 半深（身体中心沿朝向到前方的距离，scale=1） */
const frontEdge = (box: MeleeDetectBox): number => box.offset.z + box.size.z / 2

const presets = Object.entries(MELEE_WEAPON_PRESETS) as [string, MeleeWeaponConfig][]

describe('近战 detectBox = 武器动作模组估算攻击范围盒 + 0.05', () => {
    it.each(presets)('%s 的 detectBox 与估算公式一致', (_id, weapon) => {
        const mesh = createWeaponMesh(weapon.mesh)
        const expected = estimateDetectBox(mesh.hitBox.reach)
        mesh.cleanup()
        expect(weapon.detectBox.size.x).toBeCloseTo(expected.size.x, 4)
        expect(weapon.detectBox.size.y).toBeCloseTo(expected.size.y, 4)
        expect(weapon.detectBox.size.z).toBeCloseTo(expected.size.z, 4)
        expect(weapon.detectBox.offset.z).toBeCloseTo(expected.offset.z, 4)
        expect(weapon.detectBox.offset.x).toBe(0)
        expect(weapon.detectBox.offset.y).toBe(0)
    })

    it('攻击范围随武器长度递增：短剑 < 长剑 < 巨剑 < 长枪', () => {
        const order = ['short_sword', 'long_sword', 'heavy_sword', 'spear'] as const
        const fronts = order.map(id => frontEdge(MELEE_WEAPON_PRESETS[id].detectBox))
        for (let i = 1; i < fronts.length; i++) {
            expect(fronts[i], order[i]).toBeGreaterThan(fronts[i - 1])
        }
    })

    it('长枪前缘最远；双斧 / 战锤均远于短剑', () => {
        const spear = frontEdge(MELEE_WEAPON_PRESETS.spear.detectBox)
        for (const [, weapon] of presets) {
            expect(frontEdge(weapon.detectBox)).toBeLessThanOrEqual(spear)
        }
        expect(frontEdge(MELEE_WEAPON_PRESETS.war_hammer.detectBox))
            .toBeGreaterThan(frontEdge(MELEE_WEAPON_PRESETS.short_sword.detectBox))
        expect(frontEdge(MELEE_WEAPON_PRESETS.dual_axe.detectBox))
            .toBeGreaterThan(frontEdge(MELEE_WEAPON_PRESETS.short_sword.detectBox))
    })
})
