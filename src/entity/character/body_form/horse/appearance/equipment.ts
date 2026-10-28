import type {CreatureArmorSlotBuild} from '../../common/creature_runtime/equipment.ts'
import {createCreatureEquipmentAppearance} from '../../common/creature_runtime/equipment.ts'
import {createCreatureArmorKit} from '../../common/creature_runtime/armor_kit.ts'

const kitOf = (ctx: Parameters<CreatureArmorSlotBuild>[0]) =>
    createCreatureArmorKit(ctx.builder, ctx.joint, ctx.material, ctx.color, ctx.accentColor)

/** 马首面甲：沿口鼻纵轴的分片面甲 + 眉脊 + 颊甲；铁甲套附加额前尖冠 */
const head: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    const leather = ctx.pieceId.includes('leather')
    kit.plate(kit.main, 0.32, 0.48, 0.09, 0, 0.05, 0.26, Math.PI / 2, 0, 0, 0.55)
    kit.box(kit.accent, 0.34, 0.06, 0.12, 0, 0.15, 0.10, 0.15, 0, 0)
    kit.box(kit.accent, 0.055, 0.14, 0.26, -0.16, 0.04, 0.18, 0, 0, 0.08)
    kit.box(kit.accent, 0.055, 0.14, 0.26, 0.16, 0.04, 0.18, 0, 0, -0.08)
    if (leather) {
        kit.box(kit.accent, 0.24, 0.035, 0.26, 0, 0.01, 0.22, 0.08, 0, 0)
        kit.box(kit.accent, 0.19, 0.032, 0.24, 0, -0.02, 0.40, 0.06, 0, 0)
    } else {
        kit.spike(kit.accent, 0.04, 0.18, 0, 0.20, 0.06, 0.50, 0, 0, 5)
        kit.box(kit.accent, 0.045, 0.18, 0.06, 0, 0.17, 0.13, 0.25, 0, 0)
    }
}

/** 马身具装：前胸 / 中段 / 后臀三片具装 + 背脊 + 侧裙甲；铁甲套附加肩甲尖刺 */
const torso: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    const leather = ctx.pieceId.includes('leather')
    kit.plate(kit.main, 0.68, 0.32, 0.10, 0, 0.05, 0.46, Math.PI / 2, 0, 0, 0.80)
    kit.plate(kit.main, 0.72, 0.22, 0.84, 0, 0.02, -0.02, 0, 0, 0, 0.96)
    kit.plate(kit.main, 0.68, 0.20, 0.55, 0, 0.01, -0.50, Math.PI / 2, 0, 0, 1.02)
    kit.box(kit.accent, 0.06, 0.10, 1.02, 0, 0.40, -0.12)
    kit.box(kit.accent, 0.70, 0.045, 0.07, 0, 0.18, 0.08)
    kit.box(kit.accent, 0.10, 0.16, 0.24, -0.37, 0.06, -0.12, 0, 0, 0.15)
    kit.box(kit.accent, 0.10, 0.16, 0.24, 0.37, 0.06, -0.12, 0, 0, -0.15)
    if (!leather) {
        kit.spike(kit.accent, 0.045, 0.20, -0.33, 0.22, 0.35, 0, 0, 0.65, 4)
        kit.spike(kit.accent, 0.045, 0.20, 0.33, 0.22, 0.35, 0, 0, -0.65, 4)
    } else {
        kit.box(kit.accent, 0.60, 0.035, 0.05, 0, -0.06, 0.30)
        kit.box(kit.accent, 0.56, 0.035, 0.05, 0, -0.08, -0.28)
    }
}

/** 马腿铁甲：上 / 下两段长护板 + 束带 + 膝前尖刺 */
const legs: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    kit.plate(kit.main, 0.30, 0.26, 0.30, 0, -0.20, 0, 0, 0, 0, 0.82)
    kit.plate(kit.main, 0.20, 0.28, 0.20, 0, -0.48, 0, 0, 0, 0, 0.86)
    kit.box(kit.accent, 0.32, 0.04, 0.32, 0, -0.33, 0)
    kit.spike(kit.accent, 0.04, 0.18, 0, -0.36, 0.15, Math.PI / 2, 0, 0, 5)
    kit.box(kit.accent, 0.035, 0.18, 0.05, -0.13, -0.44, 0.02, 0, 0, 0.18)
    kit.box(kit.accent, 0.035, 0.18, 0.05, 0.13, -0.44, 0.02, 0, 0, -0.18)
}

/** 马蹄铁护甲：蹄壳 + 前缘踏刃 + 蹄缘束带 */
const hooves: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    kit.plate(kit.main, 0.22, 0.12, 0.26, 0, 0.06, 0.02, 0, 0, 0, 0.86)
    kit.box(kit.accent, 0.19, 0.05, 0.20, 0, 0.02, 0.10)
    kit.spike(kit.accent, 0.03, 0.11, 0, 0.05, 0.17, Math.PI / 2, 0, 0, 4)
    kit.box(kit.accent, 0.21, 0.028, 0.24, 0, 0.115, 0.02)
}

/** 马护甲外观：金属面甲 / 三片式具装 / 长腿甲 / 蹄铁；皮革套偏束带与软甲 */
export const createHorseEquipmentAppearance = createCreatureEquipmentAppearance({
    armorMaterial: 'metal',
    armor: {head, torso, legs, hooves},
})
