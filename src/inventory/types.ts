/** 背包装备槽位 */
export const EQUIP_SLOTS = ['main_hand', 'off_hand', 'head', 'chest', 'arms', 'legs'] as const
export type EquipSlot = typeof EQUIP_SLOTS[number]

export const EQUIP_SLOT_LABELS: Record<EquipSlot, string> = {
    main_hand: '主手',
    off_hand: '副手',
    head: '头部',
    chest: '躯干',
    arms: '手臂',
    legs: '腿部',
}

/** 形状旋转（0..3，顺时针 90°） */
export const PLACEMENT_ROTATIONS = [0, 1, 2, 3] as const
export type PlacementRot = typeof PLACEMENT_ROTATIONS[number]

/** 背包格位（左上角坐标 + 旋转） */
export interface Placement {
    x: number
    y: number
    rot: PlacementRot
}

/** 物品实例 */
export interface ItemStack {
    instanceId: string
    defId: string
    count: number
    /** 背包格位；装备中 / 容器中 / 世界中时缺省 */
    grid?: Placement
}

/** 玩家背包状态 */
export interface InventoryState {
    width: number
    height: number
    stacks: ItemStack[]
    /** 槽位 → 物品实例 id（装备中的物品仍在 stacks 中） */
    equipment: Partial<Record<EquipSlot, string>>
}

/** 背包默认尺寸 */
export const INVENTORY_DEFAULT_WIDTH = 8
export const INVENTORY_DEFAULT_HEIGHT = 6
/** 背包格像素边长（UI） */
export const INVENTORY_CELL_PX = 44

/** JSON-safe 背包存档结构（可选字段，旧档缺失 = 空背包） */
export interface InventorySaveData {
    width: number
    height: number
    items: Array<{
        instanceId: string
        defId: string
        count: number
        grid?: {x: number; y: number; rot: number}
    }>
    equipment: Partial<Record<EquipSlot, string>>
}