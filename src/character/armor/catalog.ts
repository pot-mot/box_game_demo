import {addDamageProfiles, ZERO_PROFILE} from '../combat/defense.ts'
import type {DamageTypeProfile} from '../combat/damage_type.ts'
import type {DefenseProfile} from '../combat/defense.ts'
import {ARMOR_PRESETS} from './armor_pieces.ts'
import {LIMB_PRESETS} from './limb_pieces.ts'
import {ARMOR_SLOTS, LIMB_SLOTS, type ArmorSlot, type LimbSlot} from './slots.ts'
import type {
    ArmorLoadout,
    ArmorPieceConfig,
    LimbLoadout,
    LimbPieceConfig,
    ResolvedArmorLoadout,
    ResolvedLimbLoadout,
} from './types.ts'

/**
 * 装备目录：护甲与肢体组件的装备表校验、目录查询与数值汇总（防御 / 攻击加成 / 移速）。
 * 未知 id / 槽位不匹配一律回退空槽（存档容错，不抛错）；肢体与护甲共用同一汇总函数。
 */

export {ARMOR_PRESETS} from './armor_pieces.ts'
export {LIMB_PRESETS} from './limb_pieces.ts'

/** 全部护甲预设（面板下拉与测试枚举用） */
export const ALL_ARMOR_PRESETS: readonly ArmorPieceConfig[] = Object.values(ARMOR_PRESETS)

/** 全部肢体预设（面板下拉与测试枚举用） */
export const ALL_LIMB_PRESETS: readonly LimbPieceConfig[] = Object.values(LIMB_PRESETS)

/** 按 id 查护甲预设 */
export const findArmorPreset = (id: string | undefined): ArmorPieceConfig | undefined =>
    id === undefined ? undefined : ARMOR_PRESETS[id]

/** 按 id 查肢体预设 */
export const findLimbPreset = (id: string | undefined): LimbPieceConfig | undefined =>
    id === undefined ? undefined : LIMB_PRESETS[id]

/** 某槽位可选护甲（面板下拉用） */
export const armorPiecesOfSlot = (slot: ArmorSlot): readonly ArmorPieceConfig[] =>
    ALL_ARMOR_PRESETS.filter(piece => piece.slot === slot)

/** 某槽位可选肢体（面板下拉用） */
export const limbPiecesOfSlot = (slot: LimbSlot): readonly LimbPieceConfig[] =>
    ALL_LIMB_PRESETS.filter(piece => piece.slot === slot)

/** 校验护甲装备表：未知 id / 槽位与 id 不符 → 空槽 */
export const resolveArmorLoadout = (loadout: ArmorLoadout | undefined): ResolvedArmorLoadout => {
    const resolved: Partial<Record<ArmorSlot, ArmorPieceConfig>> = {}
    if (loadout === undefined) return resolved
    for (const slot of ARMOR_SLOTS) {
        const piece = findArmorPreset(loadout[slot])
        if (piece !== undefined && piece.slot === slot) resolved[slot] = piece
    }
    return resolved
}

/** 校验肢体装备表：未知 id / 槽位与 id 不符 / null → 空槽（回退默认人类肢体） */
export const resolveLimbLoadout = (loadout: LimbLoadout | undefined): ResolvedLimbLoadout => {
    const resolved: Partial<Record<LimbSlot, LimbPieceConfig>> = {}
    if (loadout === undefined) return resolved
    for (const slot of LIMB_SLOTS) {
        const piece = findLimbPreset(loadout[slot])
        if (piece !== undefined && piece.slot === slot) resolved[slot] = piece
    }
    return resolved
}

/** 有效防御 = 基础防御 + 各槽位护甲之和 + 各槽位肢体之和 */
export const totalDefenseOf = (
    base: DefenseProfile,
    resolved: ResolvedArmorLoadout,
    resolvedLimbs?: ResolvedLimbLoadout,
): DefenseProfile => {
    let total: DamageTypeProfile = base
    for (const slot of ARMOR_SLOTS) {
        const piece = resolved[slot]
        if (piece !== undefined) total = addDamageProfiles(total, piece.defense)
    }
    if (resolvedLimbs !== undefined) {
        for (const slot of LIMB_SLOTS) {
            const piece = resolvedLimbs[slot]
            if (piece !== undefined) total = addDamageProfiles(total, piece.defense)
        }
    }
    return total
}

/** 攻击加成 = 各槽位护甲与肢体攻击加成之和（与武器类别匹配时才计入伤害） */
export const totalAttackOf = (
    resolved: ResolvedArmorLoadout,
    resolvedLimbs?: ResolvedLimbLoadout,
): DamageTypeProfile => {
    let total: DamageTypeProfile = ZERO_PROFILE
    for (const slot of ARMOR_SLOTS) {
        const piece = resolved[slot]
        if (piece !== undefined) total = addDamageProfiles(total, piece.attack)
    }
    if (resolvedLimbs !== undefined) {
        for (const slot of LIMB_SLOTS) {
            const piece = resolvedLimbs[slot]
            if (piece !== undefined) total = addDamageProfiles(total, piece.attack)
        }
    }
    return total
}

/** 移速乘数 = 各槽位护甲与肢体移速乘数之积（空装备表 = 1） */
export const totalMoveSpeedOf = (
    resolved: ResolvedArmorLoadout,
    resolvedLimbs?: ResolvedLimbLoadout,
): number => {
    let multiplier = 1
    for (const slot of ARMOR_SLOTS) {
        const piece = resolved[slot]
        if (piece !== undefined) multiplier *= piece.moveSpeedMultiplier
    }
    if (resolvedLimbs !== undefined) {
        for (const slot of LIMB_SLOTS) {
            const piece = resolvedLimbs[slot]
            if (piece !== undefined) multiplier *= piece.moveSpeedMultiplier
        }
    }
    return multiplier
}
