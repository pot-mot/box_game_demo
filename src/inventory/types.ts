import type {StringLocaleKey} from '../i18n/index.ts'
import type {EquipSlotKey} from '../character/equipment/types.ts'

/** 背包装备槽位键（`kind:bodyPart`，由当前体形 `equipSlots` 提供；未知键安全丢弃） */
export type EquipSlot = EquipSlotKey

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
    /** 槽位键 → 物品实例 id（装备中的物品仍在 stacks 中） */
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

/** 物品装备类别（与装备域 `EquipKind` 一致；`block` 等非装备物品无此字段） */
export type ItemEquipKind = 'limb' | 'weapon' | 'armor'

/** 物品装备槽本地化名键（体形自定义部位；缺省回退 kind + bodyPart） */
export type EquipSlotLabelKey = StringLocaleKey
