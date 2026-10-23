import {createCreatureEquipmentAppearance} from '../../common/creature_runtime/equipment.ts'

/** 狼装备外观：皮革护甲 + 毛皮肢体护具，按槽位挂在骨骼节点上 */
export const createWolfEquipmentAppearance = createCreatureEquipmentAppearance({
    armorMaterial: 'leather',
    limbMaterial: 'fur',
    armor: {
        head: {w: 0.32, h: 0.3, d: 0.36, offset: [0, 0.02, 0.06]},
        torso: {w: 0.34, h: 0.34, d: 0.9, offset: [0, 0.02, 0]},
        legs: {w: 0.16, h: 0.3, d: 0.16, offset: [0, -0.1, 0]},
        claw: {w: 0.12, h: 0.12, d: 0.18, offset: [0, -0.05, 0.04]},
    },
    limb: {
        claw: {w: 0.13, h: 0.13, d: 0.2, offset: [0, -0.05, 0.05]},
        head: {w: 0.34, h: 0.32, d: 0.38, offset: [0, 0.02, 0.06]},
        torso: {w: 0.36, h: 0.36, d: 0.92, offset: [0, 0.02, 0]},
        legs: {w: 0.18, h: 0.32, d: 0.18, offset: [0, -0.1, 0]},
        tail: {w: 0.12, h: 0.12, d: 0.3, offset: [0, 0, -0.15]},
    },
})
