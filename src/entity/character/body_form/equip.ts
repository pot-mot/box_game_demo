import type {ArmorLoadout, LimbLoadout} from '../../../character/armor/types.ts'
import type {ArmorSlot, LimbSlot} from '../../../character/armor/slots.ts'
import type {EquipSlotSet} from './types.ts'

/**
 * 按体形计划的 `equipSlots` 过滤护甲 / 肢体装备表：
 * 剔除该体形不支持的槽位条目（切换体形时旧装备安全丢弃，不抛错）。
 */
export const filterEquipLoadouts = (
    equipSlots: EquipSlotSet,
    armor: ArmorLoadout,
    limb: LimbLoadout,
): {armor: Partial<Record<ArmorSlot, string>>; limb: Partial<Record<LimbSlot, string>>} => {
    const filteredArmor: Partial<Record<ArmorSlot, string>> = {}
    for (const slot of equipSlots.armor) {
        const value = armor[slot]
        if (value !== undefined) filteredArmor[slot] = value
    }
    const filteredLimb: Partial<Record<LimbSlot, string>> = {}
    for (const slot of equipSlots.limb) {
        const value = limb[slot]
        if (value !== undefined) filteredLimb[slot] = value
    }
    return {armor: filteredArmor, limb: filteredLimb}
}
