import type {EquipSlot, InventorySaveData, InventoryState, ItemStack, Placement, PlacementRot} from './types.ts'
import {EQUIP_SLOTS, INVENTORY_DEFAULT_HEIGHT, INVENTORY_DEFAULT_WIDTH} from './types.ts'
import {findItemDef, isKnownItemId, type ItemDef} from './items.ts'
import {buildOccupancy, canPlace, findPlacement, shapeInfo} from './grid.ts'

let instanceCounter = 0

/** 生成物品实例 id（时间戳 + 自增，避免同帧冲突） */
export const createInstanceId = (): string =>
    `item_${Date.now().toString(36)}_${(instanceCounter++).toString(36)}`

export const createInventory = (
    width = INVENTORY_DEFAULT_WIDTH,
    height = INVENTORY_DEFAULT_HEIGHT,
): InventoryState => ({width, height, stacks: [], equipment: {}})

export const findStack = (inv: InventoryState, instanceId: string): ItemStack | undefined =>
    inv.stacks.find(s => s.instanceId === instanceId)

export interface AddItemResult {
    ok: boolean
    instanceId?: string
    reason?: 'full' | 'unknown'
}

/**
 * 添加物品：可堆叠物品优先合并到既有未满堆叠（且未被装备），剩余按形状寻找格位。
 * 空间不足时回滚本次已加入的堆叠，保证「要么全进、要么不进」（拾取语义）。
 */
export const addItem = (
    inv: InventoryState,
    defId: string,
    count: number,
    idFactory: () => string = createInstanceId,
): AddItemResult => {
    const def = findItemDef(defId)
    if (def === undefined) return {ok: false, reason: 'unknown'}
    let remaining = Math.max(1, Math.floor(count))
    const added: string[] = []

    const rollback = (): AddItemResult => {
        for (const id of added) {
            const idx = inv.stacks.findIndex(s => s.instanceId === id)
            if (idx !== -1) inv.stacks.splice(idx, 1)
        }
        return {ok: false, reason: 'full'}
    }

    if (def.maxStack > 1) {
        for (const stack of inv.stacks) {
            if (stack.defId !== defId || stack.grid === undefined) continue
            const space = def.maxStack - stack.count
            if (space <= 0) continue
            const moved = Math.min(space, remaining)
            stack.count += moved
            remaining -= moved
            if (remaining <= 0) break
        }
    }

    while (remaining > 0) {
        const chunk = Math.min(remaining, def.maxStack)
        const occ = buildOccupancy(inv)
        const placement = findPlacement(occ, inv.width, inv.height, def.shape)
        if (placement === undefined) return rollback()
        const instanceId = idFactory()
        inv.stacks.push({instanceId, defId, count: chunk, grid: placement})
        added.push(instanceId)
        remaining -= chunk
    }

    return {ok: true, instanceId: added[added.length - 1]}
}

/** 移除实例（数量缺省为全部）；装备映射同步清理 */
export const removeAt = (inv: InventoryState, instanceId: string, count?: number): boolean => {
    const idx = inv.stacks.findIndex(s => s.instanceId === instanceId)
    if (idx === -1) return false
    const stack = inv.stacks[idx]
    if (count !== undefined && count < stack.count) {
        stack.count -= count
        return true
    }
    for (const slot of Object.keys(inv.equipment) as EquipSlot[]) {
        if (inv.equipment[slot] === instanceId) delete inv.equipment[slot]
    }
    inv.stacks.splice(idx, 1)
    return true
}

/** 移动背包内物品到指定格位（校验形状与占用） */
export const moveStack = (inv: InventoryState, instanceId: string, placement: Placement): boolean => {
    const stack = findStack(inv, instanceId)
    if (stack === undefined) return false
    const def = findItemDef(stack.defId)
    if (def === undefined) return false
    const info = shapeInfo(def.shape, placement.rot)
    const occ = buildOccupancy(inv, instanceId)
    if (!canPlace(occ, inv.width, inv.height, info, placement.x, placement.y)) return false
    stack.grid = placement
    return true
}

const slotAccepts = (def: ItemDef, slot: EquipSlot): boolean => {
    if (def.category === 'weapon') return slot === 'main_hand' || slot === 'off_hand'
    if (def.category === 'armor') return def.equipSlot === slot
    return false
}

/** 装备：占用槽位；若已有装备则尝试放回背包（无空位则失败） */
export const equipStack = (inv: InventoryState, instanceId: string, slot: EquipSlot): boolean => {
    const stack = findStack(inv, instanceId)
    if (stack === undefined) return false
    const def = findItemDef(stack.defId)
    if (def === undefined || !slotAccepts(def, slot)) return false

    const prevId = inv.equipment[slot]
    if (prevId !== undefined && prevId !== instanceId) {
        const prev = findStack(inv, prevId)
        if (prev !== undefined) {
            const prevDef = findItemDef(prev.defId)
            if (prevDef === undefined) return false
            const occ = buildOccupancy(inv, instanceId)
            const placement = findPlacement(occ, inv.width, inv.height, prevDef.shape)
            if (placement === undefined) return false
            prev.grid = placement
        }
    }

    stack.grid = undefined
    inv.equipment[slot] = instanceId
    return true
}

/** 卸下：把装备中的物品放回背包（无空位则失败） */
export const unequipSlot = (inv: InventoryState, slot: EquipSlot): boolean => {
    const instanceId = inv.equipment[slot]
    if (instanceId === undefined) return false
    const stack = findStack(inv, instanceId)
    if (stack === undefined) {
        delete inv.equipment[slot]
        return false
    }
    const def = findItemDef(stack.defId)
    if (def === undefined) return false
    const occ = buildOccupancy(inv)
    const placement = findPlacement(occ, inv.width, inv.height, def.shape)
    if (placement === undefined) return false
    stack.grid = placement
    delete inv.equipment[slot]
    return true
}

export const equippedStacks = (inv: InventoryState): ReadonlyArray<{slot: EquipSlot; stack: ItemStack}> => {
    const out: Array<{slot: EquipSlot; stack: ItemStack}> = []
    for (const slot of Object.keys(inv.equipment) as EquipSlot[]) {
        const id = inv.equipment[slot]
        if (id === undefined) continue
        const stack = findStack(inv, id)
        if (stack !== undefined) out.push({slot, stack})
    }
    return out
}

/**
 * 跨容器移动物品（背包 ↔ 箱子），保留实例 id 与数量：优先尝试指定格位，否则自动寻位。
 * 若源物品处于装备状态（无格位），先解除其装备映射（等价于卸下后再存入）。
 */
export const transferStack = (
    from: InventoryState,
    to: InventoryState,
    instanceId: string,
    placement?: Placement,
): boolean => {
    const stack = findStack(from, instanceId)
    if (stack === undefined) return false
    const def = findItemDef(stack.defId)
    if (def === undefined) return false

    let target = placement
    if (target !== undefined) {
        const info = shapeInfo(def.shape, target.rot)
        if (!canPlace(buildOccupancy(to), to.width, to.height, info, target.x, target.y)) target = undefined
    }
    if (target === undefined) {
        target = findPlacement(buildOccupancy(to), to.width, to.height, def.shape)
    }
    if (target === undefined) return false

    for (const slot of Object.keys(from.equipment) as EquipSlot[]) {
        if (from.equipment[slot] === instanceId) delete from.equipment[slot]
    }
    removeAt(from, instanceId)
    to.stacks.push({instanceId, defId: stack.defId, count: stack.count, grid: target})
    return true
}

const clampInt = (v: number, min: number, max: number): number =>
    Math.min(Math.max(Math.floor(v), min), max)

/** 背包 → JSON-safe 存档 */
export const inventoryToSave = (inv: InventoryState): InventorySaveData => ({
    width: inv.width,
    height: inv.height,
    items: inv.stacks.map(s => ({
        instanceId: s.instanceId,
        defId: s.defId,
        count: s.count,
        ...(s.grid !== undefined ? {grid: {x: s.grid.x, y: s.grid.y, rot: s.grid.rot}} : {}),
    })),
    equipment: {...inv.equipment},
})

/** JSON-safe 存档 → 背包（未知 defId / 非法格位 / 未知装备槽安全丢弃，绝不抛错） */
export const inventoryFromSave = (data: InventorySaveData | undefined): InventoryState => {
    if (data === undefined) return createInventory()
    const inv = createInventory(clampInt(data.width, 1, 16), clampInt(data.height, 1, 12))
    const seen = new Set<string>()
    for (const it of data.items) {
        if (!isKnownItemId(it.defId) || seen.has(it.instanceId)) continue
        seen.add(it.instanceId)
        const def = findItemDef(it.defId)
        if (def === undefined) continue
        const stack: ItemStack = {
            instanceId: it.instanceId,
            defId: it.defId,
            count: Math.max(1, Math.floor(it.count)),
        }
        if (it.grid !== undefined) {
            const rot = clampInt(it.grid.rot, 0, 3) as PlacementRot
            const placement: Placement = {x: Math.floor(it.grid.x), y: Math.floor(it.grid.y), rot}
            const info = shapeInfo(def.shape, rot)
            if (canPlace(buildOccupancy(inv), inv.width, inv.height, info, placement.x, placement.y)) {
                stack.grid = placement
            }
        }
        inv.stacks.push(stack)
    }

    for (const slot of EQUIP_SLOTS) {
        const id = data.equipment[slot]
        if (id === undefined) continue
        const stack = findStack(inv, id)
        if (stack === undefined) continue
        const def = findItemDef(stack.defId)
        if (def === undefined || !slotAccepts(def, slot)) continue
        inv.equipment[slot] = id
        stack.grid = undefined
    }

    /* 未装备且无合法格位的物品尝试自动归位；仍放不下则丢弃（保持库存可见一致） */
    for (const stack of inv.stacks) {
        if (stack.grid !== undefined) continue
        if (Object.values(inv.equipment).includes(stack.instanceId)) continue
        const def = findItemDef(stack.defId)
        if (def === undefined) continue
        const placement = findPlacement(buildOccupancy(inv), inv.width, inv.height, def.shape)
        if (placement !== undefined) stack.grid = placement
    }
    return inv
}
