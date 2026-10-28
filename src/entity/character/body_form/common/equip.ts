import type {EquipKind, EquipSlotDef, EquipmentState} from '../../../../character/equipment/types.ts'
import {equipmentEntriesOf, withEquipmentAt} from '../../../../character/equipment/types.ts'
import {findArmorPreset, findLimbPreset, pieceAllowedForBodyForm} from '../../../../character/armor/catalog.ts'

/**
 * 按体形计划的 `equipSlots` 过滤装备状态：
 * 剔除该体形未声明的槽位条目（切换体形时旧装备安全丢弃，不抛错）。
 * 提供 `bodyFormId` 时，已注册的护甲 / 肢体预设还须通过 `allowedBodyFormIds` 校验，
 * 避免同名槽位（如 head / legs）保留其他体形的装备；未知 id 仍按原样保留，由解析层回退。
 * 同一 `kind:bodyPart` 槽位只保留一个物品；未声明的 kind/bodyPart 一律丢弃。
 */
export const filterEquipmentState = (
    slots: readonly EquipSlotDef[],
    state: EquipmentState,
    bodyFormId?: string,
): EquipmentState => {
    const allowed = new Set(slots.map(slot => `${slot.kind}:${slot.bodyPart}`))
    let filtered: EquipmentState = {limb: {}, weapon: {}, armor: {}}
    for (const entry of equipmentEntriesOf(state)) {
        if (!allowed.has(entry.key)) continue
        if (bodyFormId !== undefined) {
            /* 仅对已注册预设做体形校验；未知 id 保留原样由后续解析层安全回退（不在此改写装备表） */
            const piece = entry.kind === 'armor'
                ? findArmorPreset(entry.itemId)
                : entry.kind === 'limb' ? findLimbPreset(entry.itemId) : undefined
            if (piece !== undefined && !pieceAllowedForBodyForm(piece, bodyFormId)) continue
        }
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
