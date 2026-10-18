import {describe, it, expect} from 'vitest'
import {ITEM_CATEGORIES, ITEM_DEFS} from './items.ts'
import {weaponsOfForm} from '../character/weapon/catalog.ts'
import {HUMANOID_BODY_FORM_ID} from '../entity/character/body_form/index.ts'
import {ALL_ARMOR_PRESETS} from '../character/armor/catalog.ts'
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

    it('每个武器模型都有对应物品（weaponId 指向武器目录 id）', () => {
        const weaponItemIds = new Set(ITEM_DEFS.filter(def => def.category === 'weapon').map(def => def.weaponId))
        /* 物品为通用可拾取物：仅人形武器进背包目录（生物武器体形锁定，非通用物品） */
        for (const weapon of weaponsOfForm(HUMANOID_BODY_FORM_ID)) {
            /* 无可视模型的天然 / 空手类别（mesh = none）不可拾取，不要求物品条目 */
            if (weapon.mesh.id === 'none') continue
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

    it('每件物品都有专属图标且已在图标 sprite 登记', () => {
        const icons = ITEM_DEFS.map(def => def.icon)
        for (const def of ITEM_DEFS) {
            expect(ICON_NAMES, `未知图标：${def.id} → ${def.icon}`).toContain(def.icon)
        }
        expect(new Set(icons).size, '物品图标应逐件专属').toBe(icons.length)
    })
})
