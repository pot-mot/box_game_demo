import {describe, it, expect} from 'vitest'
import {ITEM_CATEGORIES, ITEM_DEFS} from './items.ts'
import {weaponsOfForm} from '../character/weapon/catalog.ts'
import {BODY_FORM_IDS, HUMANOID_BODY_FORM_ID, bodyFormOf} from '../entity/character/body_form/index.ts'
import {allArmorPresets, allLimbPresets} from '../character/armor/catalog.ts'
import {ENTITY_TYPE_VALUES} from '../entity/constants.ts'
import {BOX_PRESET_IDS} from '../types/boxPreset.ts'
import {AREA_PRESET_IDS} from '../types/areaPreset.ts'
import {ICON_NAMES} from '../ui/icons/sprite.ts'

/** 方块实体类型（物品图鉴需覆盖全部方块类实体） */
const BLOCK_ENTITY_TYPES = ['box', 'area'] as const

describe('物品目录完整性', () => {
    it('物品 id 唯一', () => {
        const ids = ITEM_DEFS.map(def => def.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('每个体形的可物品化武器都有对应物品，天然武器不进物品表', () => {
        const weaponItems = ITEM_DEFS.filter(def => def.category === 'weapon')
        for (const formId of BODY_FORM_IDS) {
            const form = bodyFormOf(formId)
            for (const weapon of weaponsOfForm(formId)) {
                const item = weaponItems.find(def => def.weaponId === weapon.id)
                if (weapon.natural === true) {
                    expect(item, `天然武器不应有物品：${weapon.id}`).toBeUndefined()
                    continue
                }
                expect(item, `缺少武器物品：${weapon.id}`).toBeDefined()
                expect(item?.equipSlot, weapon.id).toBe(weapon.equipBodyParts[0])
                expect(form.weapons.some(candidate => candidate.id === weapon.id), weapon.id).toBe(true)
            }
        }
        /* 人形天然空手同样不在物品表 */
        const humanoid = bodyFormOf(HUMANOID_BODY_FORM_ID)
        for (const natural of humanoid.weapons.filter(weapon => weapon.natural === true)) {
            expect(ITEM_DEFS.some(def => def.weaponId === natural.id), natural.id).toBe(false)
        }
    })

    it('每个护甲预设都有对应物品（armorId + equipSlot 与预设一致）', () => {
        const armorItems = ITEM_DEFS.filter(def => def.category === 'armor')
        for (const preset of allArmorPresets()) {
            const item = armorItems.find(def => def.armorId === preset.id)
            expect(item, `缺少护甲物品：${preset.id}`).toBeDefined()
            expect(item?.equipSlot).toBe(preset.slot)
        }
    })

    it('每个肢体预设都有对应物品（limbId + equipSlot 与预设一致）', () => {
        const limbItems = ITEM_DEFS.filter(def => def.category === 'limb')
        for (const preset of allLimbPresets()) {
            const item = limbItems.find(def => def.limbId === preset.id)
            expect(item, `缺少肢体物品：${preset.id}`).toBeDefined()
            expect(item?.equipSlot).toBe(preset.slot)
            expect(item?.equipBodyFormId).toBe(preset.allowedBodyFormIds?.[0])
        }
    })

    it('每个方块实体类型都有对应物品（blockType 为合法实体类型）', () => {
        const blockItems = ITEM_DEFS.filter(def => def.category === 'block')
        for (const entityType of BLOCK_ENTITY_TYPES) {
            const item = blockItems.find(def => def.blockType === entityType)
            expect(item, `缺少方块物品：${entityType}`).toBeDefined()
        }
        for (const item of blockItems) {
            expect(ENTITY_TYPE_VALUES).toContain(item.blockType)
        }
    })

    it('每个箱子特性预设都有对应方块物品（boxPreset 合法）', () => {
        const presetItems = ITEM_DEFS.filter(def => def.category === 'block' && def.blockType === 'box')
        for (const preset of BOX_PRESET_IDS) {
            const item = presetItems.find(def => def.boxPreset === preset)
            expect(item, `缺少箱型物品：${preset}`).toBeDefined()
        }
        for (const item of presetItems) {
            expect(item.boxPreset, `箱型物品缺少预设：${item.id}`).toBeDefined()
        }
    })

    it('每个区域预设都有对应方块物品（areaPreset 合法）', () => {
        const presetItems = ITEM_DEFS.filter(def => def.category === 'block' && def.blockType === 'area')
        for (const preset of AREA_PRESET_IDS) {
            const item = presetItems.find(def => def.areaPreset === preset)
            expect(item, `缺少区域物品：${preset}`).toBeDefined()
        }
        for (const item of presetItems) {
            expect(item.areaPreset, `区域物品缺少预设：${item.id}`).toBeDefined()
        }
    })

    it('物品类别都属于已知类别', () => {
        for (const def of ITEM_DEFS) {
            expect(ITEM_CATEGORIES).toContain(def.category)
        }
    })

    it('每件物品都有已登记图标（同类物品可复用图标）', () => {
        for (const def of ITEM_DEFS) {
            expect(ICON_NAMES, `未知图标：${def.id} → ${def.icon}`).toContain(def.icon)
        }
    })
})
