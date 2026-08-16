import {describe, it, expect} from 'vitest'
import {
    buildMeleeSkillSlots,
    MELEE_CHAIN_SLOTS,
    MELEE_HEAVY_CHAIN_COOLDOWN,
    MELEE_HEAVY_DURATION,
    MELEE_LIGHT_CHAIN_COOLDOWN,
    MELEE_LIGHT_DURATION,
    MELEE_SKILL_PRESETS,
    type MeleeSkillConfig,
} from './melee_skill.ts'
import {MELEE_WEAPON_PRESETS} from '../weapon/melee_weapon.ts'

const presets = Object.entries(MELEE_SKILL_PRESETS) as [string, MeleeSkillConfig][]
const presetIds = presets.map(([key]) => key)
const weaponIds = Object.keys(MELEE_WEAPON_PRESETS)

describe('MELEE_SKILL_PRESETS（链段预设）', () => {
    it('每把武器 4 段，共 24 个预设', () => {
        expect(presets).toHaveLength(weaponIds.length * MELEE_CHAIN_SLOTS.length)
    })

    it.each(presetIds)('%s 的 id 与 key 匹配', (key) => {
        expect(MELEE_SKILL_PRESETS[key].id).toBe(key)
    })

    it.each(presetIds)('%s 的 type 为 melee', (key) => {
        expect(MELEE_SKILL_PRESETS[key].type).toBe('melee')
    })

    it('轻段时长统一 0.4s，重段时长统一 0.5s', () => {
        for (const weaponId of weaponIds) {
            expect(MELEE_SKILL_PRESETS[`${weaponId}_light_1`].duration).toBe(MELEE_LIGHT_DURATION)
            expect(MELEE_SKILL_PRESETS[`${weaponId}_light_2`].duration).toBe(MELEE_LIGHT_DURATION)
            expect(MELEE_SKILL_PRESETS[`${weaponId}_heavy_1`].duration).toBe(MELEE_HEAVY_DURATION)
            expect(MELEE_SKILL_PRESETS[`${weaponId}_heavy_2`].duration).toBe(MELEE_HEAVY_DURATION)
        }
    })

    it('链终止冷却只挂起手段（_1），链中段（_2）冷却为 0', () => {
        for (const weaponId of weaponIds) {
            expect(MELEE_SKILL_PRESETS[`${weaponId}_light_1`].cooldown).toBe(MELEE_LIGHT_CHAIN_COOLDOWN)
            expect(MELEE_SKILL_PRESETS[`${weaponId}_heavy_1`].cooldown).toBe(MELEE_HEAVY_CHAIN_COOLDOWN)
            expect(MELEE_SKILL_PRESETS[`${weaponId}_light_2`].cooldown).toBe(0)
            expect(MELEE_SKILL_PRESETS[`${weaponId}_heavy_2`].cooldown).toBe(0)
        }
    })

    it('每个键名唯一', () => {
        const ids = presets.map(([, s]) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})

describe('buildMeleeSkillSlots（4 槽结构与链闭合）', () => {
    it('产出 4 槽：[轻1, 重1, 轻2, 重2]', () => {
        const slots = buildMeleeSkillSlots('short_sword')
        expect(slots).toHaveLength(4)
        expect(slots.map(s => s.config.id)).toEqual([
            'short_sword_light_1',
            'short_sword_heavy_1',
            'short_sword_light_2',
            'short_sword_heavy_2',
        ])
    })

    it('槽 0/1 为起手槽（isChainEntry），槽 2/3 为链中段', () => {
        const slots = buildMeleeSkillSlots('short_sword')
        expect(slots[0].isChainEntry).toBe(true)
        expect(slots[1].isChainEntry).toBe(true)
        expect(slots[2].isChainEntry).toBeUndefined()
        expect(slots[3].isChainEntry).toBeUndefined()
    })

    it('循环链闭合：轻1→轻2→轻1，重1→重2→重1', () => {
        const slots = buildMeleeSkillSlots('short_sword')
        expect(slots[0].comboChain).toEqual(['short_sword_light_2'])
        expect(slots[2].comboChain).toEqual(['short_sword_light_1'])
        expect(slots[1].comboChain).toEqual(['short_sword_heavy_2'])
        expect(slots[3].comboChain).toEqual(['short_sword_heavy_1'])
    })

    it('链指向的 skillId 均存在于本武器槽内', () => {
        for (const weaponId of weaponIds) {
            const slots = buildMeleeSkillSlots(weaponId)
            const ids = slots.map(s => s.config.id)
            for (const slot of slots) {
                for (const nextId of slot.comboChain ?? []) {
                    expect(ids, `${weaponId} 链闭合`).toContain(nextId)
                }
            }
        }
    })

    it('重段伤害 = 轻段伤害 × 1.6', () => {
        const slots = buildMeleeSkillSlots('short_sword')
        const lightDamage = slots[0].config.weapon.damage
        expect(slots[2].config.weapon.damage).toBe(lightDamage)
        expect(slots[1].config.weapon.damage).toBeCloseTo(lightDamage * 1.6)
        expect(slots[3].config.weapon.damage).toBeCloseTo(lightDamage * 1.6)
    })

    it('overrides 覆写伤害/侦测范围，段时长取预设', () => {
        const slots = buildMeleeSkillSlots('short_sword', {damage: 99, range: 5})
        for (const slot of slots) {
            expect(slot.config.weapon.range).toBe(5)
        }
        expect(slots[0].config.weapon.damage).toBe(99)
        expect(slots[1].config.weapon.damage).toBeCloseTo(99 * 1.6)
        expect(slots[0].config.duration).toBe(MELEE_LIGHT_DURATION)
        expect(slots[1].config.duration).toBe(MELEE_HEAVY_DURATION)
    })

    it('overrides.cooldown 同时覆写轻/重起手槽链终止冷却', () => {
        const slots = buildMeleeSkillSlots('short_sword', {cooldown: 1.5})
        expect(slots[0].config.cooldown).toBe(1.5)
        expect(slots[1].config.cooldown).toBe(1.5)
        expect(slots[2].config.cooldown).toBe(0)
        expect(slots[3].config.cooldown).toBe(0)
    })

    it('全部近战武器均可装配出闭合双链', () => {
        for (const weaponId of weaponIds) {
            const slots = buildMeleeSkillSlots(weaponId)
            expect(slots).toHaveLength(4)
            expect(slots.every(s => s.config.type === 'melee')).toBe(true)
        }
    })
})
