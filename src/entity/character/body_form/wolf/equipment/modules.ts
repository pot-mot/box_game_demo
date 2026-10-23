import {buildEquipmentModules} from '../../common/equipment.ts'
import {WOLF_EQUIP_SLOTS} from '../state/equip_slots.ts'
import {WOLF_ARMOR_PIECES} from './armor.ts'
import {WOLF_LIMB_PIECES} from './limb.ts'
import {WOLF_WEAPONS} from './weapons.ts'

/** 狼装备模组：爪 / 头 / 躯干 / 腿 / 尾 共享各自挂载骨骼配置 */
export const WOLF_EQUIPMENT_MODULES = buildEquipmentModules('wolf', WOLF_EQUIP_SLOTS, {
    armor: WOLF_ARMOR_PIECES,
    limb: WOLF_LIMB_PIECES,
    weapons: WOLF_WEAPONS,
})
