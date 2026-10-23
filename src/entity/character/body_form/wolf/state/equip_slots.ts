import type {EquipSlotDef} from '../../../../../character/equipment/types.ts'

/** 狼装备槽表：爪 / 头 / 躯干 / 腿 / 尾（肢体与护甲），爪 / 头（武器）。 */
export const WOLF_EQUIP_SLOTS: readonly EquipSlotDef[] = [
    {kind: 'limb', bodyPart: 'claw', mountJointIds: ['flFoot', 'frFoot'], nameKey: 'equip_slot.claw'},
    {kind: 'limb', bodyPart: 'head', mountJointIds: ['head'], nameKey: 'equip_slot.head'},
    {kind: 'limb', bodyPart: 'torso', mountJointIds: ['body'], nameKey: 'equip_slot.torso'},
    {kind: 'limb', bodyPart: 'legs', mountJointIds: ['flHip', 'frHip', 'rlHip', 'rrHip'], nameKey: 'equip_slot.legs'},
    {kind: 'limb', bodyPart: 'tail', mountJointIds: ['tailA'], nameKey: 'equip_slot.tail'},
    {kind: 'weapon', bodyPart: 'claw', mountJointIds: ['flFoot', 'frFoot'], nameKey: 'equip_slot.claw'},
    {kind: 'weapon', bodyPart: 'head', mountJointIds: ['mouthMount'], nameKey: 'equip_slot.head'},
    {kind: 'armor', bodyPart: 'claw', mountJointIds: ['flFoot', 'frFoot'], nameKey: 'equip_slot.claw'},
    {kind: 'armor', bodyPart: 'head', mountJointIds: ['head'], nameKey: 'equip_slot.head'},
    {kind: 'armor', bodyPart: 'torso', mountJointIds: ['body'], nameKey: 'equip_slot.torso'},
    {kind: 'armor', bodyPart: 'legs', mountJointIds: ['flHip', 'frHip', 'rlHip', 'rrHip'], nameKey: 'equip_slot.legs'},
]
