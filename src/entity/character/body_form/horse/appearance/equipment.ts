import {createCreatureEquipmentAppearance} from '../../common/creature_runtime/equipment.ts'

/** 马装备外观：金属马甲 / 面甲 / 蹄铁 + 皮质腿尾护具 */
export const createHorseEquipmentAppearance = createCreatureEquipmentAppearance({
    armorMaterial: 'metal',
    limbMaterial: 'leather',
    armor: {
        hooves: {w: 0.2, h: 0.16, d: 0.26, offset: [0, 0.06, 0.02]},
        head: {w: 0.32, h: 0.4, d: 0.6, offset: [0, 0, 0.15]},
        torso: {w: 0.55, h: 0.6, d: 1.4, offset: [0, 0, 0]},
        legs: {w: 0.22, h: 0.44, d: 0.22, offset: [0, -0.2, 0]},
    },
    limb: {
        head: {w: 0.34, h: 0.42, d: 0.62, offset: [0, 0, 0.15]},
        torso: {w: 0.58, h: 0.62, d: 1.42, offset: [0, 0, 0]},
        legs: {w: 0.24, h: 0.46, d: 0.24, offset: [0, -0.2, 0]},
        tail: {w: 0.16, h: 0.16, d: 0.44, offset: [0, 0, -0.2]},
    },
})
