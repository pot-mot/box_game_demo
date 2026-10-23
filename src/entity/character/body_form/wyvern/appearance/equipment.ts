import {createCreatureEquipmentAppearance} from '../../common/creature_runtime/equipment.ts'

/** 飞龙装备外观：鳞甲 / 翼甲 / 尾棘 + 翼爪与头部肢甲 */
export const createWyvernEquipmentAppearance = createCreatureEquipmentAppearance({
    armorMaterial: 'scale',
    limbMaterial: 'scale',
    armor: {
        head: {w: 0.4, h: 0.3, d: 0.5, offset: [0, 0.02, 0.12]},
        torso: {w: 0.8, h: 0.5, d: 1.0, offset: [0, 0, 0]},
        legs: {w: 0.3, h: 0.8, d: 0.3, offset: [0, -0.35, 0]},
        wing: {w: 0.36, h: 1.0, d: 0.7, offset: [0, -0.3, 0.1]},
        tail: {w: 0.24, h: 0.24, d: 1.0, offset: [0, -0.05, -0.4]},
    },
    limb: {
        wing_claw: {w: 0.3, h: 0.3, d: 0.4, offset: [0, -0.04, 0.08]},
        wing: {w: 0.38, h: 1.02, d: 0.72, offset: [0, -0.3, 0.1]},
        head: {w: 0.42, h: 0.32, d: 0.52, offset: [0, 0.02, 0.12]},
        torso: {w: 0.82, h: 0.52, d: 1.02, offset: [0, 0, 0]},
        legs: {w: 0.32, h: 0.82, d: 0.32, offset: [0, -0.35, 0]},
        tail: {w: 0.26, h: 0.26, d: 1.02, offset: [0, -0.05, -0.4]},
    },
})
