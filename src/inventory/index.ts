export {
    EQUIP_SLOTS,
    EQUIP_SLOT_LABELS,
    PLACEMENT_ROTATIONS,
    INVENTORY_DEFAULT_WIDTH,
    INVENTORY_DEFAULT_HEIGHT,
    INVENTORY_CELL_PX,
} from './types.ts'
export type {EquipSlot, Placement, PlacementRot, ItemStack, InventoryState, InventorySaveData} from './types.ts'
export {
    ITEM_CATEGORIES,
    ITEM_CATEGORY_LABELS,
    ITEM_DEFS,
    findItemDef,
    isKnownItemId,
} from './items.ts'
export type {ItemCategory, ItemDef} from './items.ts'
export {shapeInfo, buildOccupancy, canPlace, findPlacement} from './grid.ts'
export type {ShapeInfo} from './grid.ts'
export {
    createInventory,
    createInstanceId,
    findStack,
    addItem,
    removeAt,
    moveStack,
    equipStack,
    unequipSlot,
    equippedStacks,
    transferStack,
    inventoryToSave,
    inventoryFromSave,
} from './inventory.ts'
export type {AddItemResult} from './inventory.ts'
