import type {CharacterEntitySystem} from '../../entity/character/physics/world.ts'
import type {ItemEntityContext} from '../../entity/item/types.ts'
import type {InteractableContext, InteractableEntity} from '../../entity/interactable/types.ts'
import type {BuildingGeneratorContext} from '../../entity/building_generator/types/index.ts'
import {EQUIP_SLOTS, type EquipSlot, type InventoryState} from '../../inventory/types.ts'
import {
    addItem,
    equipStack,
    findItemDef,
    findStack,
    inventoryFromSave,
    inventoryToSave,
    moveStack,
    removeAt,
    unequipSlot,
} from '../../inventory/index.ts'
import {getInputRegistry} from '../../input/registry.ts'
import {DEFAULT_WEAPON_ID} from '../../character/weapon/catalog.ts'
import type {ArmorLoadout} from '../../character/armor/types.ts'
import {createInventoryPanel, type InventoryPanel} from './inventory_ui/panel.ts'
import {createContainerPanel, type ContainerPanel} from './container_ui/panel.ts'
import {createEquipmentPreview, type EquipPreviewData} from './equipment_ui/preview.ts'
import {createMapPanel, type MapMarker} from './map_ui/panel.ts'
import type {PlaySaveData} from './save.ts'

export interface HakoniwaSystems {
    updater: (dt: number) => void
    getSaveData: () => PlaySaveData
    tryPickup: (defId: string, count: number) => boolean
    /** 打开箱子：自动收集箱内存放的物品定义 */
    openChest: (e: InteractableEntity) => void
    /** 交互传送点：解锁并打开地图 / 传送选点 */
    onTeleport: (e: InteractableEntity) => void
    /** 脱困：传送至最近存档点（无存档点则回退最近已解锁传送点） */
    teleportToNearestSavePoint: () => boolean
    dispose: () => void
}

/**
 * 箱庭背包 / 装备子系统：管理玩家背包、装备应用（与角色战斗数值互通）与背包面板。
 * UI 由输入事件驱动（`onActionDown`），不需要每帧 updater。
 */
export const setupHakoniwa = (
    characterSystem: CharacterEntitySystem,
    itemEntities: ItemEntityContext,
    interactables: InteractableContext,
    building: BuildingGeneratorContext,
    saved: PlaySaveData | undefined,
): HakoniwaSystems => {
    const input = getInputRegistry()
    const inventory: InventoryState = inventoryFromSave(saved?.inventory)
    const knownTeleports = new Set<string>(saved?.knownTeleports ?? [])
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
        onDrop: (instanceId) => dropToWorld(instanceId),
        onEquipmentChanged: () => applyEquipment(),
    })

    /* 模型展示预览 + 环绕式装备槽（挂到背包面板右侧；首次打开背包时惰性创建，避免额外 WebGL 上下文） */
    let preview: ReturnType<typeof createEquipmentPreview> | undefined
    const ensurePreview = (): void => {
        if (preview !== undefined) return
        preview = createEquipmentPreview()
        panel.attachPreview(preview.canvas)
        preview.setEquipment(previewData())
        preview.render()
    }

    const previewData = (): EquipPreviewData => {
        const armor: Partial<Record<EquipSlot, string>> = {}
        for (const slot of EQUIP_SLOTS) {
            const def = equippedDef(slot)
            if (def?.armorId !== undefined) armor[slot] = def.armorId
        }
        const main = equippedDef('main_hand')
        const off = equippedDef('off_hand')
        return {
            mainWeaponId: main?.weaponId,
            offhandWeaponId: off?.weaponId,
            armor,
        }
    }

    const refreshPreview = (): void => {
        if (preview === undefined) return
        preview.setEquipment(previewData())
        preview.render()
    }

    /** 把装备映射同步到角色：主手 / 副手武器与四槽护甲 */
    const applyEquipment = (): void => {
        const player = characterSystem.getPlayerCharacter()
        if (player === undefined) return
        const mainDef = equippedDef('main_hand')
        const offDef = equippedDef('off_hand')
        characterSystem.updateCharacterConfig(
            player.id,
            {},
            {weaponId: mainDef?.weaponId ?? DEFAULT_WEAPON_ID},
            undefined, undefined, undefined, undefined, undefined,
            offDef?.weaponId !== undefined ? {weaponId: offDef.weaponId} : null,
        )
        const armor: Partial<Record<'head' | 'chest' | 'arms' | 'legs', string>> = {}
        for (const slot of EQUIP_SLOTS) {
            if (slot !== 'head' && slot !== 'chest' && slot !== 'arms' && slot !== 'legs') continue
            const def = equippedDef(slot)
            if (def?.armorId !== undefined) armor[slot] = def.armorId
        }
        characterSystem.updateCharacterConfig(
            player.id, {},
            undefined, undefined, undefined, undefined, undefined,
            {armor: armor as ArmorLoadout},
        )
        refreshPreview()
    }

    const equippedDef = (slot: EquipSlot) => {
        const id = inventory.equipment[slot]
        return id === undefined ? undefined : findItemDef(findStack(inventory, id)?.defId ?? '')
    }

    const dropToWorld = (instanceId: string): void => {
        const stack = findStack(inventory, instanceId)
        if (stack === undefined) return
        const player = characterSystem.getPlayerCharacter()
        const pos = player?.body.translation()
        const facing = player !== undefined ? characterSystem.getFacing(player.id) : 0
        const rad = facing * Math.PI / 180
        const x = (pos?.x ?? 0) + Math.sin(rad) * 1.2
        const z = (pos?.z ?? 0) + Math.cos(rad) * 1.2
        const y = (pos?.y ?? 0) - 0.4
        itemEntities.drop(stack.defId, stack.count, x, y, z)
        removeAt(inventory, instanceId)
        panel.refresh()
    }

    const tryPickup = (defId: string, count: number): boolean => {
        const result = addItem(inventory, defId, count)
        if (result.ok) panel.refresh()
        return result.ok
    }

    /* 双栏容器（箱子）面板：玩家背包 ↔ 箱子，拖拽存取 */
    const containerPanel: ContainerPanel = createContainerPanel({
        getPlayerInventory: () => inventory,
        /* 转移只涉及有格位的物品，装备映射不受影响，无需重算角色装备 */
        onChanged: () => panel.refresh(),
    })
    const openChest = (e: InteractableEntity): void => {
        containerPanel.open(e.container, `箱子 #${e.id}`)
    }

    const openInventory = (): void => {
        ensurePreview()
        panel.toggle()
    }
    input.onActionDown('open_inventory', openInventory)
    input.onActionDown('open_equipment', openInventory)

    /* ── 地图 / 传送点 ── */
    const getMarkers = (): MapMarker[] => {
        const out: MapMarker[] = []
        for (const e of interactables.getAll()) {
            if (e.config.kind === 'teleport') {
                const key = `teleport:${e.config.name}`
                out.push({key, kind: 'teleport', name: e.config.name, x: e.base.x, z: e.base.z, known: knownTeleports.has(key)})
            } else if (e.config.kind === 'save_point') {
                out.push({key: `save_point:${e.config.name}`, kind: 'save_point', name: e.config.name, x: e.base.x, z: e.base.z, known: e.on})
            }
        }
        return out
    }
    const map = createMapPanel(building, getMarkers)

    const teleportPlayer = (x: number, z: number): void => {
        const player = characterSystem.getPlayerCharacter()
        if (player === undefined) return
        const t = player.body.translation()
        player.body.setTranslation({x, y: t.y + 0.5, z}, true)
        player.body.setLinvel({x: 0, y: 0, z: 0}, true)
        player.body.wakeUp()
    }

    const onTeleport = (e: InteractableEntity): void => {
        if (e.config.kind !== 'teleport') return
        const key = `teleport:${e.config.name}`
        knownTeleports.add(key)
        e.on = true
        if (knownTeleports.size <= 1) {
            map.setVisible(true)
            return
        }
        map.beginTeleportSelect((picked) => {
            map.setVisible(false)
            const marker = getMarkers().find(m => m.kind === 'teleport' && m.key === picked)
            if (marker !== undefined) teleportPlayer(marker.x, marker.z)
        })
    }

    /* ── 脱困：传送至最近存档点（由右上角设置菜单触发，不占快捷键） ── */
    const teleportToNearestSavePoint = (): boolean => {
        const player = characterSystem.getPlayerCharacter()
        if (player === undefined) return false
        const t = player.body.translation()
        const all = getMarkers()
        /* 优先最近的已点燃存档点；没有则退而求其次到最近的已解锁传送点 */
        const saves = all.filter(m => m.kind === 'save_point' && m.known)
        const candidates = saves.length > 0 ? saves : all.filter(m => m.kind === 'teleport' && m.known)
        if (candidates.length === 0) return false
        let best = candidates[0]
        let bestDist = (best.x - t.x) ** 2 + (best.z - t.z) ** 2
        for (const p of candidates) {
            const d = (p.x - t.x) ** 2 + (p.z - t.z) ** 2
            if (d < bestDist) { bestDist = d; best = p }
        }
        teleportPlayer(best.x, best.z)
        return true
    }
    input.onActionDown('open_map', () => map.toggle())

    const updater = (_dt: number): void => {
        if (!map.isVisible()) return
        const player = characterSystem.getPlayerCharacter()
        if (player === undefined) return
        const t = player.body.translation()
        map.update(t.x, t.z, characterSystem.getFacing(player.id) * Math.PI / 180)
    }

    /* 存档恢复了背包装备时同步到角色与预览；否则仅刷新预览（不覆盖存档中的武器配置） */
    if (Object.keys(inventory.equipment).length > 0) applyEquipment()
    else refreshPreview()

    const getSaveData = (): PlaySaveData => ({
        inventory: inventoryToSave(inventory),
        knownTeleports: [...knownTeleports],
    })

    return {
        updater,
        getSaveData,
        tryPickup,
        openChest,
        onTeleport,
        teleportToNearestSavePoint,
        dispose: () => {
            panel.destroy()
            containerPanel.destroy()
            preview?.dispose()
            map.dispose()
        },
    }
}
