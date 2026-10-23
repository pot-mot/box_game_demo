import type {EquipKind, EquipSlotDef, EquipmentState} from '../../../../character/equipment/types.ts'
import {equipmentEntriesOf, withEquipmentAt} from '../../../../character/equipment/types.ts'

/**
 * 按体形计划的 `equipSlots` 过滤装备状态：
 * 剔除该体形未声明的槽位条目（切换体形时旧装备安全丢弃，不抛错）。
 * 同一 `kind:bodyPart` 槽位只保留一个物品；未声明的 kind/bodyPart 一律丢弃。
 */
export const filterEquipmentState = (
    slots: readonly EquipSlotDef[],
    state: EquipmentState,
): EquipmentState => {
    const allowed = new Set(slots.map(slot => `${slot.kind}:${slot.bodyPart}`))
    let filtered: EquipmentState = {limb: {}, weapon: {}, armor: {}}
    for (const entry of equipmentEntriesOf(state)) {
        if (!allowed.has(entry.key)) continue
        filtered = withEquipmentAt(filtered, entry.kind, entry.bodyPart, entry.itemId)
    }
    return filtered
}

/** 体形是否声明某槽位 */
export const hasEquipSlot = (
    slots: readonly EquipSlotDef[],
    kind: EquipKind,
    bodyPart: string,
): boolean => slots.some(slot => slot.kind === kind && slot.bodyPart === bodyPart)
