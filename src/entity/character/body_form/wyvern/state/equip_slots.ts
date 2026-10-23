import type {EquipSlotDef} from '../../../../../character/equipment/types.ts'

/** 双足飞龙装备槽表：翼爪 / 翼 / 头 / 躯干 / 腿 / 尾（肢体与护甲），翼爪 / 吐息（武器）。 */
export const WYVERN_EQUIP_SLOTS: readonly EquipSlotDef[] = [
    {kind: 'limb', bodyPart: 'wing_claw', mountJointIds: ['wingLClaw', 'wingRClaw'], nameKey: 'equip_slot.wing_claw'},
    {kind: 'limb', bodyPart: 'wing', mountJointIds: ['wingLBase', 'wingRBase'], nameKey: 'equip_slot.wing'},
    {kind: 'limb', bodyPart: 'head', mountJointIds: ['head'], nameKey: 'equip_slot.head'},
    {kind: 'limb', bodyPart: 'torso', mountJointIds: ['body'], nameKey: 'equip_slot.torso'},
    {kind: 'limb', bodyPart: 'legs', mountJointIds: ['flHip', 'frHip'], nameKey: 'equip_slot.legs'},
    {kind: 'limb', bodyPart: 'tail', mountJointIds: ['tailA'], nameKey: 'equip_slot.tail'},
    {kind: 'weapon', bodyPart: 'wing_claw', mountJointIds: ['wingLClaw', 'wingRClaw'], nameKey: 'equip_slot.wing_claw'},
    {kind: 'weapon', bodyPart: 'breath', mountJointIds: ['mouthMount'], nameKey: 'equip_slot.breath'},
    {kind: 'armor', bodyPart: 'head', mountJointIds: ['head'], nameKey: 'equip_slot.head'},
    {kind: 'armor', bodyPart: 'torso', mountJointIds: ['body'], nameKey: 'equip_slot.torso'},
    {kind: 'armor', bodyPart: 'legs', mountJointIds: ['flHip', 'frHip'], nameKey: 'equip_slot.legs'},
    {kind: 'armor', bodyPart: 'wing', mountJointIds: ['wingLBase', 'wingRBase'], nameKey: 'equip_slot.wing'},
    {kind: 'armor', bodyPart: 'tail', mountJointIds: ['tailA'], nameKey: 'equip_slot.tail'},
]
