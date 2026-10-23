import {buildEquipmentModules} from '../../common/equipment.ts'
import {HUMANOID_EQUIP_SLOTS} from '../state/equip_slots.ts'
import {HUMANOID_WEAPONS} from './weapons.ts'
import {HUMANOID_ARMOR_PIECES} from './armor.ts'
import {HUMANOID_LIMB_PIECES} from './limb.ts'

/** 人形装备模组：同槽位共享挂载骨骼配置（护甲 / 肢体 / 武器各自批量化） */
export const HUMANOID_EQUIPMENT_MODULES = buildEquipmentModules('humanoid', HUMANOID_EQUIP_SLOTS, {
    armor: HUMANOID_ARMOR_PIECES,
    limb: HUMANOID_LIMB_PIECES,
    weapons: HUMANOID_WEAPONS,
})
