import {describe, it, expect} from 'vitest'
import {ITEM_CATEGORIES, ITEM_DEFS} from './items.ts'
import {ALL_WEAPON_PRESETS} from '../character/weapon/catalog.ts'
import {ALL_ARMOR_PRESETS} from '../character/armor/catalog.ts'
import {ENTITY_TYPE_VALUES} from '../entity/constants.ts'
import {BOX_PRESET_IDS} from '../types/boxPreset.ts'
import {ICON_NAMES} from '../ui/icons/sprite.ts'

/** 方块实体类型（物品图鉴需覆盖全部方块类实体） */
const BLOCK_ENTITY_TYPES = ['box', 'area/water'] as const

describe('物品目录完整性', () => {
    it('物品 id 唯一', () => {
        const ids = ITEM_DEFS.map(def => def.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('每个武器模型都有对应物品（weaponId 指向武器目录 id）', () => {
        const weaponItemIds = new Set(ITEM_DEFS.filter(def => def.category === 'weapon').map(def => def.weaponId))
        for (const weapon of ALL_WEAPON_PRESETS) {
            expect(weaponItemIds.has(weapon.id), `缺少武器物品：${weapon.id}`).toBe(true)
        }
    })

    it('每个护甲预设都有对应物品（armorId + equipSlot 与预设一致）', () => {
        const armorItems = ITEM_DEFS.filter(def => def.category === 'armor')
        for (const preset of ALL_ARMOR_PRESETS) {
            const item = armorItems.find(def => def.armorId === preset.id)
            expect(item, `缺少护甲物品：${preset.id}`).toBeDefined()
            expect(item?.equipSlot).toBe(preset.slot)
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

    it('物品类别都属于已知类别', () => {
        for (const def of ITEM_DEFS) {
            expect(ITEM_CATEGORIES).toContain(def.category)
        }
    })

    it('每件物品都有专属图标且已在图标 sprite 登记', () => {
        const icons = ITEM_DEFS.map(def => def.icon)
        for (const def of ITEM_DEFS) {
            expect(ICON_NAMES, `未知图标：${def.id} → ${def.icon}`).toContain(def.icon)
        }
        expect(new Set(icons).size, '物品图标应逐件专属').toBe(icons.length)
    })
})
