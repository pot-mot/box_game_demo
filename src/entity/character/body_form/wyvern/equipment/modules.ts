import {buildEquipmentModules} from '../../common/equipment.ts'
import {WYVERN_EQUIP_SLOTS} from '../state/equip_slots.ts'
import {WYVERN_ARMOR_PIECES} from './armor.ts'
import {WYVERN_LIMB_PIECES} from './limb.ts'
import {WYVERN_WEAPONS} from './weapons.ts'
import {WYVERN_BREATH_MODULES} from './breath.ts'

/** 飞龙装备模组：翼爪 / 翼 / 头 / 躯干 / 腿 / 尾 / 吐息 共享各自挂载骨骼配置 */
export const WYVERN_EQUIPMENT_MODULES = buildEquipmentModules('wyvern', WYVERN_EQUIP_SLOTS, {
    armor: WYVERN_ARMOR_PIECES,
    limb: WYVERN_LIMB_PIECES,
    weapons: WYVERN_WEAPONS,
    breaths: WYVERN_BREATH_MODULES,
})
