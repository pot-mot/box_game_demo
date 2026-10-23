import type {EquipSlotDef, EquipmentModuleDef} from '../../../../character/equipment/types.ts'
import type {ArmorPieceConfig, LimbPieceConfig} from '../../../../character/armor/types.ts'
import type {WeaponConfig} from '../../../../character/weapon/catalog.ts'
import type {BreathModuleConfig} from '../../../../character/weapon/breath_module.ts'

export interface EquipmentModuleSources {
    readonly armor?: readonly ArmorPieceConfig[]
    readonly limb?: readonly LimbPieceConfig[]
    readonly weapons?: readonly WeaponConfig[]
    readonly breaths?: readonly BreathModuleConfig[]
}

const pieceIdsOfSlot = (
    slot: EquipSlotDef,
    sources: EquipmentModuleSources,
): readonly string[] => {
    if (slot.kind === 'armor') {
        return (sources.armor ?? []).filter(piece => piece.slot === slot.bodyPart).map(piece => piece.id)
    }
    if (slot.kind === 'limb') {
        return (sources.limb ?? []).filter(piece => piece.slot === slot.bodyPart).map(piece => piece.id)
    }
    return [
        ...(sources.weapons ?? [])
            .filter(weapon => weapon.formId !== undefined && weapon.equipBodyParts.includes(slot.bodyPart))
            .map(weapon => weapon.id),
        ...(slot.bodyPart === 'breath' ? (sources.breaths ?? []).map(breath => breath.id) : []),
    ]
}

/**
 * 由体形槽位 + 单件装备批量化生成装备模组：
 * 同槽位的全部装备共享该槽位的骨骼挂载配置（`mountJointIds`），模组是装配与校验单位。
 * 空槽位不生成模组（没有可装备物品）。
 */
export const buildEquipmentModules = (
    formId: string,
    slots: readonly EquipSlotDef[],
    sources: EquipmentModuleSources,
): readonly EquipmentModuleDef[] => {
    const modules: EquipmentModuleDef[] = []
    for (const slot of slots) {
        const pieceIds = pieceIdsOfSlot(slot, sources)
        if (pieceIds.length === 0) continue
        modules.push({
            id: `${formId}:${slot.kind}:${slot.bodyPart}`,
            kind: slot.kind,
            slot: slot.bodyPart,
            mountJointIds: slot.mountJointIds,
            ...(slot.nameKey !== undefined ? {nameKey: slot.nameKey} : {}),
            pieceIds,
        })
    }
    return modules
}

/** 校验装备模组与槽位表一致：模组槽位必须存在，且 mountJointIds 与该槽位完全相同 */
export const validateEquipmentModules = (
    slots: readonly EquipSlotDef[],
    modules: readonly EquipmentModuleDef[],
): readonly string[] => {
    const errors: string[] = []
    const slotByKey = new Map(slots.map(slot => [`${slot.kind}:${slot.bodyPart}`, slot]))
    const ids = new Set<string>()
    for (const module of modules) {
        if (ids.has(module.id)) errors.push(`装备模组 id 重复：${module.id}`)
        ids.add(module.id)
        const slot = slotByKey.get(`${module.kind}:${module.slot}`)
        if (slot === undefined) {
            errors.push(`装备模组 ${module.id} 引用了不存在的槽位 ${module.kind}:${module.slot}`)
            continue
        }
        if (
            slot.mountJointIds.length !== module.mountJointIds.length
            || slot.mountJointIds.some((jointId, index) => module.mountJointIds[index] !== jointId)
        ) {
            errors.push(`装备模组 ${module.id} 的 mountJointIds 与槽位不一致`)
        }
        if (module.pieceIds.length === 0) errors.push(`装备模组 ${module.id} 没有装备`)
    }
    return errors
}
