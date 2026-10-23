import {beforeAll, describe, it, expect} from 'vitest'
import {
    armorPieceDisplayName,
    armorPiecesOfSlot,
    attackTermsOf,
    defenseTermsOf,
    equipmentAttackOf,
    equipmentDefenseOf,
    equipmentMoveSpeedOf,
    equipmentPoiseOf,
    findArmorPreset,
    moveSpeedTermsOf,
    poiseTermsOf,
    registerArmorPresets,
    resolveArmorLoadout,
    resolveEquipmentPieces,
} from '../../../../../character/armor/catalog.ts'
import {ZERO_PROFILE} from '../../../../../character/combat/defense.ts'
import {HUMANOID_ARMOR_PIECES} from './armor.ts'

beforeAll(() => registerArmorPresets(HUMANOID_ARMOR_PIECES))

const piecesOf = (armor: Readonly<Record<string, string>>) =>
    resolveEquipmentPieces({armor, limb: {}, weapon: {}}, 'humanoid')

describe('人形护甲预设（数据归属体形分包）', () => {
    it('全部预设只允许人形，槽位为四类之一，数值非负且移速为正', () => {
        expect(HUMANOID_ARMOR_PIECES.length).toBeGreaterThan(0)
        for (const piece of HUMANOID_ARMOR_PIECES) {
            expect(piece.allowedBodyFormIds, piece.id).toEqual(['humanoid'])
            expect(['head', 'chest', 'arms', 'legs'], piece.id).toContain(piece.slot)
            expect(piece.defense.physical, piece.id).toBeGreaterThanOrEqual(0)
            expect(piece.defense.magic, piece.id).toBeGreaterThanOrEqual(0)
            expect(piece.attack.physical, piece.id).toBeGreaterThanOrEqual(0)
            expect(piece.attack.magic, piece.id).toBeGreaterThanOrEqual(0)
            expect(piece.moveSpeedMultiplier, piece.id).toBeGreaterThan(0)
        }
    })

    it('注册后可按 id 查回，且槽位查询只返回该槽位装备', () => {
        const helmet = findArmorPreset('iron_helmet')
        expect(helmet).toBeDefined()
        expect(HUMANOID_ARMOR_PIECES).toContain(helmet)
        for (const piece of armorPiecesOfSlot('head')) expect(piece.slot).toBe('head')
    })
})

describe('护甲数值汇总（经统一装备状态解析）', () => {
    it('有效防御 = 基础防御 + 逐件防御', () => {
        const pieces = piecesOf({head: 'iron_helmet', chest: 'iron_plate'})
        expect(equipmentDefenseOf({physical: 1, magic: 1}, pieces)).toEqual({physical: 6, magic: 1})
    })

    it('攻击加成按类别叠加，移速乘数逐件相乘，韧性逐件相加', () => {
        const pieces = piecesOf({head: 'mage_hood', arms: 'battle_bracers', chest: 'iron_plate'})
        expect(equipmentAttackOf(pieces)).toEqual({physical: 2, magic: 1})
        expect(equipmentMoveSpeedOf(pieces)).toBeCloseTo(0.9 * 0.97, 10)
        expect(equipmentPoiseOf(pieces)).toBe(5)
    })

    it('空装备表 = 基础防御 / 零攻击 / 移速 1 / 韧性 0', () => {
        const base = {physical: 2, magic: 3}
        expect(equipmentDefenseOf(base, [])).toEqual(base)
        expect(equipmentAttackOf([])).toEqual(ZERO_PROFILE)
        expect(equipmentMoveSpeedOf([])).toBe(1)
        expect(equipmentPoiseOf([])).toBe(0)
    })

    it('未知 id / 槽位错配不参与汇总', () => {
        expect(piecesOf({head: 'no_such_armor'})).toEqual([])
        expect(piecesOf({legs: 'mage_hood'})).toEqual([])
    })
})

describe('逐项数值来源（面板公式拆解）', () => {
    it('防御 / 攻击 / 韧性 / 移速来源只列出有贡献的装备，名称已本地化', () => {
        const defense = resolveArmorLoadout({head: 'iron_helmet', chest: 'iron_plate'})
        expect(defenseTermsOf('physical', defense)).toEqual([
            {name: '铁盔', value: 2},
            {name: '铁胸甲', value: 3},
        ])
        expect(defenseTermsOf('magic', defense)).toEqual([])

        const attack = resolveArmorLoadout({head: 'mage_hood', arms: 'battle_bracers'})
        expect(attackTermsOf('physical', attack)).toEqual([{name: '战臂甲', value: 2}])
        expect(attackTermsOf('magic', attack)).toEqual([{name: '法师兜帽', value: 1}])

        expect(poiseTermsOf(defense)).toEqual([
            {name: '铁盔', value: 2},
            {name: '铁胸甲', value: 4},
        ])
        expect(moveSpeedTermsOf(resolveArmorLoadout({chest: 'iron_plate', legs: 'swift_boots'}))).toEqual([
            {name: '铁胸甲', value: 0.9},
            {name: '疾行靴', value: 1.15},
        ])
    })

    it('未知 id 不产生来源项', () => {
        expect(defenseTermsOf('physical', resolveArmorLoadout({head: 'no_such_armor'}))).toEqual([])
    })

    it('显示名经本地化键取用', () => {
        expect(armorPieceDisplayName(findArmorPreset('iron_helmet')!)).toBe('铁盔')
    })
})
