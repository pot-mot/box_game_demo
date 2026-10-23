import {beforeAll, describe, it, expect} from 'vitest'
import {
    allArmorPresets,
    allLimbPresets,
    armorPiecesOfSlot,
    equipmentAttackOf,
    equipmentDefenseOf,
    equipmentMoveSpeedOf,
    equipmentPoiseOf,
    findArmorPreset,
    findLimbPreset,
    limbPiecesOfSlot,
    registerArmorPresets,
    registerLimbPresets,
    resolveEquipmentPieces,
} from './catalog.ts'
import {ZERO_PROFILE, addDamageProfiles} from '../combat/defense.ts'
import type {ArmorPieceConfig, LimbPieceConfig} from './types.ts'

const ARMOR_A: ArmorPieceConfig = {
    id: 'test_armor_a', name: '测试甲', slot: 'head',
    defense: {physical: 2, magic: 0},
    attack: {physical: 1, magic: 0},
    moveSpeedMultiplier: 0.9,
    poise: 3,
    allowedBodyFormIds: ['test_form'],
    mesh: {id: 'helmet', color: 0xffffff},
}

const ARMOR_B: ArmorPieceConfig = {
    id: 'test_armor_b', name: '测试乙', slot: 'head',
    defense: {physical: 0, magic: 1},
    attack: {physical: 0, magic: 2},
    moveSpeedMultiplier: 1.1,
    allowedBodyFormIds: ['test_form'],
    mesh: {id: 'helmet', color: 0xffffff},
}

const LIMB_A: LimbPieceConfig = {
    id: 'test_limb_a', name: '测试肢体', slot: 'head',
    defense: {physical: 1, magic: 1},
    attack: {physical: 0, magic: 1},
    moveSpeedMultiplier: 1.2,
    poise: 2,
    allowedBodyFormIds: ['test_form'],
    mesh: {race: 'orc', color: 0x00ff00},
}

beforeAll(() => {
    registerArmorPresets([ARMOR_A, ARMOR_B])
    registerLimbPresets([LIMB_A])
})

describe('体形注册目录（跨体形）', () => {
    it('注册后可按 id 查回同一实例，并出现在全局 / 槽位查询中', () => {
        expect(findArmorPreset('test_armor_a')).toBe(ARMOR_A)
        expect(findLimbPreset('test_limb_a')).toBe(LIMB_A)
        expect(allArmorPresets()).toContain(ARMOR_A)
        expect(allLimbPresets()).toContain(LIMB_A)
        expect(armorPiecesOfSlot('head')).toContain(ARMOR_A)
        expect(limbPiecesOfSlot('head')).toContain(LIMB_A)
    })

    it('未知 / 缺省 id 安全返回 undefined', () => {
        expect(findArmorPreset('no_such_armor')).toBeUndefined()
        expect(findArmorPreset(undefined)).toBeUndefined()
        expect(findLimbPreset('no_such_limb')).toBeUndefined()
        expect(findLimbPreset(undefined)).toBeUndefined()
    })

    it('重复注册同 id 只保留最后一份（不产生重复项）', () => {
        registerArmorPresets([{...ARMOR_A, name: '测试甲改'}])
        expect(allArmorPresets().filter(piece => piece.id === ARMOR_A.id)).toHaveLength(1)
        expect(findArmorPreset(ARMOR_A.id)?.name).toBe('测试甲改')
        registerArmorPresets([ARMOR_A])
    })
})

describe('resolveEquipmentPieces（体形 fail-closed）', () => {
    it('按体形过滤：其他体形的装备不生效', () => {
        const pieces = resolveEquipmentPieces({
            armor: {head: 'test_armor_a'},
            limb: {head: 'test_limb_a'},
            weapon: {},
        }, 'other_form')
        expect(pieces).toEqual([])
    })

    it('槽位与装备声明的 slot 不匹配时剔除', () => {
        const pieces = resolveEquipmentPieces({
            armor: {chest: 'test_armor_a'},
            limb: {},
            weapon: {},
        }, 'test_form')
        expect(pieces).toEqual([])
    })

    it('合法护甲 + 肢体按槽位解析，未知 id 安全忽略', () => {
        const pieces = resolveEquipmentPieces({
            armor: {head: 'test_armor_a', chest: 'no_such_armor'},
            limb: {head: 'test_limb_a'},
            weapon: {},
        }, 'test_form')
        expect(pieces).toEqual([ARMOR_A, LIMB_A])
    })
})

describe('数值汇总（护甲 / 肢体同一口径）', () => {
    it('防御 = 基础 + 逐件防御；攻击 = 逐件攻击之和', () => {
        const base = {physical: 1, magic: 1}
        expect(equipmentDefenseOf(base, [ARMOR_A, LIMB_A])).toEqual(
            addDamageProfiles(addDamageProfiles(base, ARMOR_A.defense), LIMB_A.defense),
        )
        expect(equipmentAttackOf([ARMOR_A, ARMOR_B, LIMB_A])).toEqual({physical: 1, magic: 3})
    })

    it('移速乘数逐件相乘、韧性逐件相加；空列表回退基础值', () => {
        expect(equipmentMoveSpeedOf([ARMOR_A, ARMOR_B, LIMB_A])).toBeCloseTo(0.9 * 1.1 * 1.2, 10)
        expect(equipmentPoiseOf([ARMOR_A, LIMB_A])).toBe(5)
        expect(equipmentDefenseOf(ZERO_PROFILE, [])).toEqual(ZERO_PROFILE)
        expect(equipmentAttackOf([])).toEqual(ZERO_PROFILE)
        expect(equipmentMoveSpeedOf([])).toBe(1)
        expect(equipmentPoiseOf([])).toBe(0)
    })
})
