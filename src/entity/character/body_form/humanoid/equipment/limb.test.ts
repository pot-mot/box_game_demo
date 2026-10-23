import {beforeAll, describe, it, expect} from 'vitest'
import {
    equipmentAttackOf,
    equipmentDefenseOf,
    equipmentMoveSpeedOf,
    equipmentPoiseOf,
    findLimbPreset,
    limbPiecesOfSlot,
    registerLimbPresets,
    resolveEquipmentPieces,
} from '../../../../../character/armor/catalog.ts'
import {ZERO_PROFILE} from '../../../../../character/combat/defense.ts'
import {HUMANOID_LIMB_PIECES} from './limb.ts'

beforeAll(() => registerLimbPresets(HUMANOID_LIMB_PIECES))

const piecesOf = (limb: Readonly<Record<string, string>>) =>
    resolveEquipmentPieces({armor: {}, limb, weapon: {}}, 'humanoid')

describe('人形肢体预设（数据归属体形分包）', () => {
    it('全部预设只允许人形，每个槽位覆盖骷髅 / 兽人 / 精灵三族', () => {
        expect(HUMANOID_LIMB_PIECES.length).toBeGreaterThan(0)
        for (const piece of HUMANOID_LIMB_PIECES) {
            expect(piece.allowedBodyFormIds, piece.id).toEqual(['humanoid'])
            expect(piece.moveSpeedMultiplier, piece.id).toBeGreaterThan(0)
        }
        for (const slot of ['head', 'arms', 'body', 'legs']) {
            const races = limbPiecesOfSlot(slot).map(piece => piece.mesh.race)
            expect(new Set(races), slot).toEqual(new Set(['skeleton', 'orc', 'elf']))
        }
    })

    it('注册后可按 id 查回，且槽位查询只返回该槽位肢体', () => {
        const orcHead = findLimbPreset('orc_head')
        expect(orcHead).toBeDefined()
        expect(HUMANOID_LIMB_PIECES).toContain(orcHead)
        for (const piece of limbPiecesOfSlot('legs')) expect(piece.slot).toBe('legs')
    })
})

describe('肢体数值汇总（与护甲同一口径）', () => {
    it('防御 / 攻击 / 移速 / 韧性按件叠加', () => {
        const pieces = piecesOf({head: 'orc_head', body: 'skeleton_body'})
        expect(equipmentDefenseOf({physical: 1, magic: 1}, pieces)).toEqual({physical: 4, magic: 2})
        expect(equipmentAttackOf(piecesOf({arms: 'orc_arms', head: 'elf_head'}))).toEqual({physical: 1, magic: 1})
        expect(equipmentMoveSpeedOf(piecesOf({head: 'elf_head', legs: 'elf_legs'}))).toBeCloseTo(1.02 * 1.08, 10)
        expect(equipmentPoiseOf(pieces)).toBe(0)
    })

    it('空 / 未知 / 槽位错配回退空列表，数值不漂移', () => {
        expect(piecesOf({})).toEqual([])
        expect(piecesOf({head: 'no_such_limb'})).toEqual([])
        expect(piecesOf({body: 'elf_head'})).toEqual([])
        expect(equipmentDefenseOf(ZERO_PROFILE, [])).toEqual(ZERO_PROFILE)
        expect(equipmentAttackOf([])).toEqual(ZERO_PROFILE)
        expect(equipmentMoveSpeedOf([])).toBe(1)
        expect(equipmentPoiseOf([])).toBe(0)
    })

    it('护甲与肢体在统一装备状态下按槽位合并', () => {
        const pieces = resolveEquipmentPieces({
            armor: {head: 'iron_helmet'},
            limb: {head: 'orc_head'},
            weapon: {},
        }, 'humanoid')
        expect(pieces.map(piece => piece.id)).toEqual(['iron_helmet', 'orc_head'])
        expect(equipmentDefenseOf(ZERO_PROFILE, pieces)).toEqual({physical: 4, magic: 0})
    })
})
