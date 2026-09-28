import type {InventorySaveData} from '../../inventory/types.ts'

/** play 模式的持久化附加数据（存于 modeInfo.play） */
export interface PlaySaveData {
    inventory?: InventorySaveData
    /** 已解锁的传送点键 */
    knownTeleports?: string[]
}
