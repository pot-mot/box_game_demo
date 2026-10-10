import {describe, it, expect} from 'vitest'
import {
    findLimbPreset,
    resolveLimbLoadout,
    resolveArmorLoadout,
    totalAttackOf,
    totalDefenseOf,
    totalMoveSpeedOf,
} from './catalog.ts'
import {ZERO_PROFILE} from '../combat/defense.ts'

describe('findLimbPreset', () => {
    it('未知 id / undefined 返回 undefined', () => {
        expect(findLimbPreset('orc_head')?.name).toBe('兽人头颅')
        expect(findLimbPreset('no_such_limb')).toBeUndefined()
        expect(findLimbPreset(undefined)).toBeUndefined()
    })
})

describe('resolveLimbLoadout（存档容错）', () => {
    it('合法装备表按槽位解析（四槽位）', () => {
        const resolved = resolveLimbLoadout({
            head: 'skeleton_head', arms: 'orc_arms', body: 'elf_body', legs: 'orc_legs',
        })
        expect(resolved.head?.id).toBe('skeleton_head')
        expect(resolved.arms?.id).toBe('orc_arms')
        expect(resolved.body?.id).toBe('elf_body')
        expect(resolved.legs?.id).toBe('orc_legs')
    })

    it('未知 id / 槽位不匹配回退空槽（不抛错）', () => {
        const resolved = resolveLimbLoadout({head: 'no_such_limb', body: 'elf_head'})
        expect(resolved.head).toBeUndefined()
        expect(resolved.body).toBeUndefined()
    })

    it('空 / undefined 装备表解析为空（默认人类肢体）', () => {
        expect(resolveLimbLoadout(undefined)).toEqual({})
        expect(resolveLimbLoadout({})).toEqual({})
    })
})

describe('肢体与护甲共用数值汇总', () => {
    it('有效防御 = 基础防御 + 护甲 + 肢体之和', () => {
        const resolvedArmor = resolveArmorLoadout({head: 'iron_helmet'})
        const resolvedLimb = resolveLimbLoadout({head: 'orc_head', body: 'skeleton_body'})
        /* 铁盔物防2 + 兽人头颅物防2 + 骷髅躯干物防1/魔防1 + 基础 1/1 */
        expect(totalDefenseOf({physical: 1, magic: 1}, resolvedArmor, resolvedLimb)).toEqual({physical: 6, magic: 2})
    })

    it('不传肢体时行为与仅护甲一致（向后兼容）', () => {
        const resolvedArmor = resolveArmorLoadout({head: 'iron_helmet'})
        expect(totalDefenseOf(ZERO_PROFILE, resolvedArmor)).toEqual({physical: 2, magic: 0})
    })

    it('攻击加成与移速乘数含肢体：按类别叠加、多件相乘', () => {
        const resolvedArmor = resolveArmorLoadout({arms: 'battle_bracers'})
        const resolvedLimb = resolveLimbLoadout({head: 'elf_head', arms: 'orc_arms', legs: 'elf_legs'})
        /* 战臂甲物攻+2；精灵头颅魔攻+1、兽人臂膀物攻+1 */
        expect(totalAttackOf(resolvedArmor, resolvedLimb)).toEqual({physical: 3, magic: 1})
        /* 战臂甲 ×0.97 × 精灵头颅 ×1.02 × 兽人臂膀 ×0.97 × 精灵腿脚 ×1.08 */
        expect(totalMoveSpeedOf(resolvedArmor, resolvedLimb)).toBeCloseTo(0.97 * 1.02 * 0.97 * 1.08, 6)
    })

    it('空护甲 + 空肢体时移速乘数 = 1、数值档案为零', () => {
        expect(totalMoveSpeedOf(resolveArmorLoadout(undefined), resolveLimbLoadout(undefined))).toBe(1)
        expect(totalAttackOf(resolveArmorLoadout(undefined), resolveLimbLoadout(undefined))).toEqual(ZERO_PROFILE)
    })
})
