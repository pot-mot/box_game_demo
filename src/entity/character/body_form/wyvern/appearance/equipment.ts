import type {CreatureArmorSlotBuild} from '../../common/creature_runtime/equipment.ts'
import {createCreatureEquipmentAppearance} from '../../common/creature_runtime/equipment.ts'
import {createCreatureArmorKit} from '../../common/creature_runtime/armor_kit.ts'
import {alignYTo} from '../../common/creature_runtime/model.ts'

const kitOf = (ctx: Parameters<CreatureArmorSlotBuild>[0]) =>
    createCreatureArmorKit(ctx.builder, ctx.joint, ctx.material, ctx.color, ctx.accentColor)

/** 龙首甲冠：颅顶甲板 + 眉脊 + 颊甲 + 后掠角冠；骸骨套角冠更长 */
const head: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    const bone = ctx.pieceId.includes('bone')
    kit.plate(kit.main, 0.54, 0.12, 0.38, 0, 0.20, 0.06, 0.06, 0, 0, 0.80)
    kit.box(kit.accent, 0.52, 0.05, 0.12, 0, 0.07, 0.28, 0.18, 0, 0)
    kit.plate(kit.main, 0.22, 0.08, 0.30, 0, 0.00, 0.44, 0.05, 0, 0, 0.55)
    kit.box(kit.accent, 0.06, 0.14, 0.26, -0.27, 0.06, 0.18, 0, 0, 0.10)
    kit.box(kit.accent, 0.06, 0.14, 0.26, 0.27, 0.06, 0.18, 0, 0, -0.10)
    const horn = bone ? 0.44 : 0.36
    kit.spike(kit.accent, 0.055, horn, -0.13, 0.24, 0.00, -0.90, 0, 0.30, 5)
    kit.spike(kit.accent, 0.055, horn, 0.13, 0.24, 0.00, -0.90, 0, -0.30, 5)
    kit.spike(kit.accent, 0.04, bone ? 0.30 : 0.24, 0, 0.28, -0.06, -1.00, 0, 0, 5)
    if (bone) {
        kit.spike(kit.accent, 0.035, 0.22, -0.19, 0.18, -0.06, -0.70, 0, 0.55, 4)
        kit.spike(kit.accent, 0.035, 0.22, 0.19, 0.18, -0.06, -0.70, 0, -0.55, 4)
    }
}

/** 龙鳞胸甲：胸 / 腹两片叠甲 + 中脊 + 两胁肋骨甲 + 背脊棘 + 翼根肩甲 */
const torso: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    const bone = ctx.pieceId.includes('bone')
    kit.plate(kit.main, 0.92, 0.20, 0.90, 0, 0.08, 0.15, 0, 0, 0, 0.96)
    kit.plate(kit.main, 0.82, 0.14, 0.78, 0, -0.10, 0.12, 0, 0, 0, 0.98)
    kit.box(kit.accent, 0.07, 0.36, 0.08, 0, 0.10, 0.58)
    for (const y of [-0.08, 0.02, 0.12]) {
        kit.box(kit.accent, 0.05, 0.10, 0.45, -0.47, y, 0.05, 0, 0, 0.25)
        kit.box(kit.accent, 0.05, 0.10, 0.45, 0.47, y, 0.05, 0, 0, -0.25)
    }
    kit.spike(kit.accent, 0.045, 0.20, -0.42, 0.22, 0.00, 0, 0, 0.60, 4)
    kit.spike(kit.accent, 0.045, 0.20, 0.42, 0.22, 0.00, 0, 0, -0.60, 4)
    for (const z of [-0.15, -0.32, -0.48]) {
        kit.spike(kit.accent, 0.04, bone ? 0.20 : 0.16, 0, 0.34, z, -0.40, 0, 0, 4)
    }
}

/** 龙腿鳞甲：大腿 / 小腿叠甲 + 束带 + 膝前利爪尖刺 + 侧刃 */
const legs: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    kit.plate(kit.main, 0.44, 0.28, 0.44, 0, -0.22, 0, 0, 0, 0, 0.82)
    kit.plate(kit.main, 0.28, 0.32, 0.28, 0, -0.56, 0, 0, 0, 0, 0.86)
    kit.box(kit.accent, 0.46, 0.045, 0.46, 0, -0.38, 0)
    kit.spike(kit.accent, 0.05, 0.22, 0, -0.40, 0.18, Math.PI / 2, 0, 0, 5)
    kit.box(kit.accent, 0.04, 0.24, 0.06, -0.16, -0.50, 0.02, 0, 0, 0.20)
    kit.box(kit.accent, 0.04, 0.24, 0.06, 0.16, -0.50, 0.02, 0, 0, -0.20)
}

/** 龙翼护甲：沿翼骨方向的翼根甲 + 前缘刃 + 外侧尖刺；骸骨套附加第二段翼甲 */
const wing: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    const sign = ctx.jointId.includes('L') ? -1 : 1
    const dx = sign * 0.34
    const dy = 0.55
    const dz = -0.28
    const rot = alignYTo(dx, dy, dz)
    kit.plate(kit.main, 0.26, 0.52, 0.13, dx * 0.34, dy * 0.34, dz * 0.34, rot[0], rot[1], rot[2], 0.42)
    kit.box(kit.accent, 0.045, 0.40, 0.07, dx * 0.30, dy * 0.30 + 0.05, dz * 0.30, rot[0], rot[1], rot[2])
    kit.spike(kit.accent, 0.045, 0.26, dx * 0.10, dy * 0.10, dz * 0.10, 0, 0, -sign * 0.70, 4)
    if (ctx.pieceId.includes('bone')) {
        const rot2 = rot
        kit.plate(kit.main, 0.18, 0.34, 0.10, dx * 0.78, dy * 0.78, dz * 0.78, rot2[0], rot2[1], rot2[2], 0.35)
        kit.spike(kit.accent, 0.035, 0.18, dx * 0.92, dy * 0.92, dz * 0.92, rot2[0], rot2[1], rot2[2], 4)
    }
}

/** 龙尾棘甲：两节尾甲 + 背脊棘 + 尾刃；骸骨套尾刃更长 */
const tail: CreatureArmorSlotBuild = ctx => {
    const kit = kitOf(ctx)
    const bone = ctx.pieceId.includes('bone')
    kit.box(kit.main, 0.24, 0.14, 0.32, 0, 0.00, -0.14)
    kit.box(kit.main, 0.20, 0.12, 0.30, 0, -0.01, -0.42)
    kit.box(kit.accent, 0.26, 0.04, 0.06, 0, 0.07, -0.12)
    kit.box(kit.accent, 0.22, 0.03, 0.05, 0, 0.06, -0.40)
    kit.spike(kit.accent, 0.04, bone ? 0.22 : 0.18, 0, 0.10, -0.20, -0.35, 0, 0, 4)
    kit.spike(kit.accent, 0.035, bone ? 0.20 : 0.15, 0, 0.09, -0.48, -0.55, 0, 0, 4)
    if (bone) {
        kit.spike(kit.accent, 0.03, 0.20, 0, 0.07, -0.60, -0.80, 0, 0, 4)
    }
}

/** 龙护甲外观：低多边形锐角鳞甲 / 角冠 / 翼根甲 / 尾棘；骨甲套偏骨白长刃 */
export const createWyvernEquipmentAppearance = createCreatureEquipmentAppearance({
    armorMaterial: 'scale',
    armor: {head, torso, legs, wing, tail},
})
