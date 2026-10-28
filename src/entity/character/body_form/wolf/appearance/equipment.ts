import type {CreatureArmorSlotBuild} from '../../common/creature_runtime/equipment.ts'
import {createCreatureEquipmentAppearance} from '../../common/creature_runtime/equipment.ts'
import {createCreatureArmorKit} from '../../common/creature_runtime/armor_kit.ts'

const kitOf = (ctx: Parameters<CreatureArmorSlotBuild>[0]) =>
    createCreatureArmorKit(ctx.builder, ctx.joint, ctx.material, ctx.color, ctx.accentColor)

/** 狼首护甲：颅顶甲板 + 眉脊 + 吻部护片 + 颊甲；骨甲套附加后掠角饰 */
const head: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    const bone = ctx.pieceId.includes('bone')
    kit.plate(kit.main, 0.32, 0.10, 0.30, 0, 0.20, 0.07, 0.06, 0, 0, 0.80)
    kit.box(kit.accent, 0.32, 0.045, 0.10, 0, 0.13, 0.23, 0.22, 0, 0)
    kit.plate(kit.main, 0.16, 0.08, 0.22, 0, 0.02, 0.34, 0.05, 0, 0, 0.55)
    kit.box(kit.accent, 0.05, 0.13, 0.20, -0.155, 0.06, 0.13, 0, 0, 0.12)
    kit.box(kit.accent, 0.05, 0.13, 0.20, 0.155, 0.06, 0.13, 0, 0, -0.12)
    if (bone) {
        kit.spike(kit.accent, 0.035, 0.22, -0.10, 0.23, 0.01, -0.65, 0, 0.28, 5)
        kit.spike(kit.accent, 0.035, 0.22, 0.10, 0.23, 0.01, -0.65, 0, -0.28, 5)
        kit.spike(kit.accent, 0.028, 0.16, 0, 0.24, -0.05, -0.9, 0, 0, 4)
    } else {
        kit.box(kit.accent, 0.18, 0.035, 0.22, 0, 0.01, 0.28, 0.05, 0, 0)
    }
}

/** 狼躯护甲：分片胸甲 + 腹甲 + 中脊 + 肩部尖甲 */
const torso: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    const bone = ctx.pieceId.includes('bone')
    kit.plate(kit.main, 0.48, 0.18, 0.24, 0, 0.10, 0.36, 0, 0, 0, 0.92)
    kit.plate(kit.main, 0.40, 0.12, 0.28, 0, -0.10, 0.10, 0, 0, 0, 0.96)
    kit.box(kit.accent, 0.055, 0.28, 0.055, 0, 0.10, 0.48)
    kit.spike(kit.accent, 0.05, 0.17, -0.24, 0.18, 0.30, 0, 0, 0.55, 4)
    kit.spike(kit.accent, 0.05, 0.17, 0.24, 0.18, 0.30, 0, 0, -0.55, 4)
    if (bone) {
        kit.box(kit.accent, 0.06, 0.22, 0.05, 0, 0.24, -0.14, -0.45, 0, 0)
        kit.box(kit.accent, 0.05, 0.20, 0.05, 0, 0.23, -0.30, -0.55, 0, 0)
        kit.spike(kit.accent, 0.045, 0.16, 0, 0.28, -0.02, -0.45, 0, 0, 4)
    } else {
        kit.box(kit.accent, 0.46, 0.035, 0.035, 0, -0.01, 0.46)
        kit.box(kit.accent, 0.38, 0.03, 0.032, 0, -0.17, 0.20)
    }
}

/** 狼腿护甲：髋 / 胫两段护板 + 膝前尖刺 + 束带；骨甲套附加侧刃 */
const legs: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    const bone = ctx.pieceId.includes('bone')
    kit.plate(kit.main, 0.20, 0.20, 0.20, 0, -0.06, 0, 0, 0, 0, 0.84)
    kit.plate(kit.main, 0.15, 0.20, 0.15, 0, -0.24, 0, 0, 0, 0, 0.90)
    kit.box(kit.accent, 0.20, 0.035, 0.20, 0, -0.15, 0)
    kit.spike(kit.accent, 0.035, 0.16, 0, -0.18, 0.10, Math.PI / 2, 0, 0, 5)
    if (bone) {
        kit.box(kit.accent, 0.035, 0.20, 0.05, -0.10, -0.15, 0.01, 0, 0, 0.20)
        kit.box(kit.accent, 0.035, 0.20, 0.05, 0.10, -0.15, 0.01, 0, 0, -0.20)
    }
}

/** 狼爪护甲：掌背甲 + 束带 + 三根前伸爪刃 */
const claw: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    const bone = ctx.pieceId.includes('bone')
    kit.plate(kit.main, 0.16, 0.10, 0.16, 0, 0.045, 0.07, 0, 0, 0, 0.80)
    kit.box(kit.accent, 0.15, 0.032, 0.15, 0, 0.095, 0.04)
    const length = bone ? 0.13 : 0.10
    for (const x of [-0.045, 0, 0.045]) {
        kit.spike(kit.accent, 0.022, length, x, 0.03, 0.16, Math.PI / 2, 0, 0, 4)
    }
    if (bone) {
        kit.box(kit.accent, 0.03, 0.09, 0.12, -0.095, 0.05, 0.05, 0, 0, 0.15)
        kit.box(kit.accent, 0.03, 0.09, 0.12, 0.095, 0.05, 0.05, 0, 0, -0.15)
    }
}

/** 狼尾护甲：两节尾甲 + 脊刺；骨甲套追加更长尾刃 */
const tail: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    const bone = ctx.pieceId.includes('bone')
    kit.box(kit.main, 0.16, 0.11, 0.24, 0, 0.02, -0.10)
    kit.box(kit.main, 0.135, 0.095, 0.22, 0, 0.01, -0.30)
    kit.box(kit.accent, 0.15, 0.03, 0.05, 0, 0.05, -0.06)
    kit.box(kit.accent, 0.12, 0.025, 0.04, 0, 0.04, -0.26)
    kit.spike(kit.accent, 0.028, 0.12, 0, 0.08, -0.12, -0.40, 0, 0, 4)
    if (bone) {
        kit.spike(kit.accent, 0.032, 0.16, 0, 0.07, -0.28, -0.55, 0, 0, 4)
        kit.spike(kit.accent, 0.026, 0.13, 0, 0.06, -0.42, -0.70, 0, 0, 4)
    }
}

/** 狼护甲外观：低多边形分片甲 + 锐利骨饰；肢体颜色由逐槽位材质替换承担 */
export const createWolfEquipmentAppearance = createCreatureEquipmentAppearance({
    armorMaterial: 'leather',
    armor: {head, torso, legs, claw, tail},
})
