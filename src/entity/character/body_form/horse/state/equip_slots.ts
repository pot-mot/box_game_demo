import type {EquipSlotDef} from '../../../../../character/equipment/types.ts'

/** 马装备槽表：头 / 躯干 / 腿 / 尾（肢体与护甲），蹄（武器）。 */
export const HORSE_EQUIP_SLOTS: readonly EquipSlotDef[] = [
    {kind: 'limb', bodyPart: 'head', mountJointIds: ['head'], nameKey: 'equip_slot.head'},
    {kind: 'limb', bodyPart: 'torso', mountJointIds: ['body'], nameKey: 'equip_slot.torso'},
    {kind: 'limb', bodyPart: 'legs', mountJointIds: ['flHip', 'frHip', 'rlHip', 'rrHip'], nameKey: 'equip_slot.legs'},
    {kind: 'limb', bodyPart: 'tail', mountJointIds: ['tailA'], nameKey: 'equip_slot.tail'},
    {kind: 'weapon', bodyPart: 'hooves', mountJointIds: ['flFoot', 'frFoot', 'rlFoot', 'rrFoot'], nameKey: 'equip_slot.hooves'},
    {kind: 'armor', bodyPart: 'hooves', mountJointIds: ['flFoot', 'frFoot', 'rlFoot', 'rrFoot'], nameKey: 'equip_slot.hooves'},
    {kind: 'armor', bodyPart: 'head', mountJointIds: ['head'], nameKey: 'equip_slot.head'},
    {kind: 'armor', bodyPart: 'torso', mountJointIds: ['body'], nameKey: 'equip_slot.torso'},
    {kind: 'armor', bodyPart: 'legs', mountJointIds: ['flHip', 'frHip', 'rlHip', 'rrHip'], nameKey: 'equip_slot.legs'},
]
