import {buildEquipmentModules} from '../../common/equipment.ts'
import {HORSE_EQUIP_SLOTS} from '../state/equip_slots.ts'
import {HORSE_ARMOR_PIECES} from './armor.ts'
import {HORSE_LIMB_PIECES} from './limb.ts'
import {HORSE_WEAPONS} from './weapons.ts'

/** 马装备模组：头 / 躯干 / 腿 / 尾 / 蹄 共享各自挂载骨骼配置 */
export const HORSE_EQUIPMENT_MODULES = buildEquipmentModules('horse', HORSE_EQUIP_SLOTS, {
    armor: HORSE_ARMOR_PIECES,
    limb: HORSE_LIMB_PIECES,
    weapons: HORSE_WEAPONS,
})
