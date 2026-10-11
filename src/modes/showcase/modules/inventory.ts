import type {ShowcaseModule} from '../module.ts'
import {setupShowcaseScene} from '../scene.ts'
import {createInventoryPanel, type InventoryPanel} from '../../play/inventory_ui/panel.ts'
import {createEquipmentPreview, type EquipmentPreview, type EquipPreviewData} from '../../play/equipment_ui/preview.ts'
import {
    addItem,
    createInventory,
    equipStack,
    findItemDef,
    findStack,
    moveStack,
    removeAt,
    unequipSlot,
} from '../../../inventory/index.ts'
import {ITEM_DEFS} from '../../../inventory/items.ts'
import {EQUIP_SLOTS, type EquipSlot, type InventoryState} from '../../../inventory/types.ts'
import {SHOWCASE_INVENTORY_WIDTH, SHOWCASE_INVENTORY_HEIGHT} from '../constants.ts'

/**
 * 背包与物品格子交互子模块。
 *
 * 内容：复用 play 模式的俄罗斯方块背包面板（`modes/play/inventory_ui`）与装备模型预览
 * （`modes/play/equipment_ui`），注入一份演示背包（全武器 / 全护甲 + 消耗品 / 材料 / 钥匙），
 * 支持拖拽移动、`R` 旋转、拖到环绕装备槽装备、点装备槽卸下、丢弃。装备变化即时同步到
 * 面板内的角色模型预览——完整复现 play 模式背包的交互效果，同时作为物品 / 装备的交互式图鉴。
 *
 * 说明：面板与预览本就是可复用的 UI 组件（仅依赖 `inventory/` 领域层），此处直接复用；
 * 主画布渲染展示场景网格作为背景。
 */
export const inventoryModule: ShowcaseModule = {
    id: 'inventory',
    title: 'showcase.module.inventory.title',
    description: 'showcase.module.inventory.desc',
    setup: host => {
        const sceneCtx = setupShowcaseScene(host.renderer)

        /* —— 演示背包：铺满全物品（消耗品 / 材料按堆叠数量） —— */
        const inventory: InventoryState = createInventory(SHOWCASE_INVENTORY_WIDTH, SHOWCASE_INVENTORY_HEIGHT)
        for (const def of ITEM_DEFS) {
            addItem(inventory, def.id, def.maxStack > 1 ? 5 : 1)
        }
        /* 预装一套装备（主手短剑 + 铁制四槽），使预览初始即有内容 */
        const equipDef = (defId: string, slot: EquipSlot): void => {
            const stack = inventory.stacks.find(s => s.defId === defId)
            if (stack !== undefined) equipStack(inventory, stack.instanceId, slot)
        }
        equipDef('weapon_short_sword', 'main_hand')
        equipDef('armor_iron_helmet', 'head')
        equipDef('armor_iron_plate', 'chest')
        equipDef('armor_iron_bracers', 'arms')
        equipDef('armor_iron_greaves', 'legs')

        const equippedDef = (slot: EquipSlot) => {
            const id = inventory.equipment[slot]
            return id === undefined ? undefined : findItemDef(findStack(inventory, id)?.defId ?? '')
        }
        const previewData = (): EquipPreviewData => {
            const armor: Partial<Record<EquipSlot, string>> = {}
            for (const slot of EQUIP_SLOTS) {
                const def = equippedDef(slot)
                if (def?.armorId !== undefined) armor[slot] = def.armorId
            }
            return {
                mainWeaponId: equippedDef('main_hand')?.weaponId,
                offhandWeaponId: equippedDef('off_hand')?.weaponId,
                armor,
            }
        }

        const preview: EquipmentPreview = createEquipmentPreview()

        const panel: InventoryPanel = createInventoryPanel({
            getInventory: () => inventory,
            onMove: (instanceId, placement) => moveStack(inventory, instanceId, placement),
            onEquip: (instanceId, slot) => {
                if (slot === undefined) {
                    const def = findItemDef(findStack(inventory, instanceId)?.defId ?? '')
                    const target: EquipSlot = def?.category === 'weapon' ? 'main_hand' : (def?.equipSlot ?? 'main_hand')
                    return equipStack(inventory, instanceId, target)
                }
                return equipStack(inventory, instanceId, slot)
            },
            onUnequip: (slot) => unequipSlot(inventory, slot),
            onDrop: (instanceId) => { removeAt(inventory, instanceId) },
            onEquipmentChanged: () => {
                preview.setEquipment(previewData())
                preview.render()
            },
        })
        panel.attachPreview(preview.canvas)
        preview.setEquipment(previewData())
        preview.render()
        panel.setVisible(true)

        const updater = (_dt: number): void => {
            sceneCtx.orbit.update(_dt)
            sceneCtx.followGrid()
            host.renderer.render(sceneCtx.scene, sceneCtx.camera)
        }

        return {
            updater,
            dispose: () => {
                panel.destroy()
                preview.dispose()
                sceneCtx.dispose()
            },
        }
    },
}
