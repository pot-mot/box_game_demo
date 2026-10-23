import type {EquipSlotDef} from '../../../../../character/equipment/types.ts'

/**
 * 人形装备槽表：护甲 / 肢体 / 武器三套槽位。
 * 武器槽的挂载节点同时列出左右腕，运行时由惯用手决定主 / 副手侧。
 */
export const HUMANOID_EQUIP_SLOTS: readonly EquipSlotDef[] = [
    {kind: 'limb', bodyPart: 'head', mountJointIds: ['headNeck'], nameKey: 'limb_slot.head'},
    {kind: 'limb', bodyPart: 'arms', mountJointIds: ['rightArmShoulder', 'leftArmShoulder'], nameKey: 'limb_slot.arms'},
    {kind: 'limb', bodyPart: 'body', mountJointIds: ['spine'], nameKey: 'limb_slot.body'},
    {kind: 'limb', bodyPart: 'legs', mountJointIds: ['rightLegHip', 'leftLegHip'], nameKey: 'limb_slot.legs'},
    {kind: 'weapon', bodyPart: 'main_hand', mountJointIds: ['rightWeaponMount', 'leftWeaponMount'], nameKey: 'equip_slot.main_hand'},
    {kind: 'weapon', bodyPart: 'off_hand', mountJointIds: ['rightWeaponMount', 'leftWeaponMount'], nameKey: 'equip_slot.off_hand'},
    {kind: 'armor', bodyPart: 'head', mountJointIds: ['headNeck'], nameKey: 'armor_slot.head'},
    {kind: 'armor', bodyPart: 'chest', mountJointIds: ['spine'], nameKey: 'armor_slot.chest'},
    {kind: 'armor', bodyPart: 'arms', mountJointIds: ['rightArmShoulder', 'leftArmShoulder'], nameKey: 'armor_slot.arms'},
    {kind: 'armor', bodyPart: 'legs', mountJointIds: ['rightLegHip', 'leftLegHip'], nameKey: 'armor_slot.legs'},
]
