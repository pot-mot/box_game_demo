import {addDamageProfiles, ZERO_PROFILE} from '../combat/defense.ts'
import type {DamageType, DamageTypeProfile} from '../combat/damage_type.ts'
import type {DefenseProfile} from '../combat/defense.ts'
import type {EquipmentState} from '../equipment/types.ts'
import {translate, type StringLocaleKey} from '../../i18n/index.ts'
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

/** 逐项数值来源（本地化显示名 + 该项贡献值）：供面板公式拆解逐项展示 */
export interface StatTerm {
    /** 来源显示名（装备名等，已本地化） */
    readonly name: string
    /** 该项贡献值（加值项为加成量，乘区项为乘数） */
    readonly value: number
}

/** 护甲 / 肢体预设 id → 本地化名称键（未知 id 回退预设数据 `name`） */
const ARMOR_NAME_KEYS: Record<string, StringLocaleKey> = {
    cloth_cap: 'armor.cloth_cap',
    iron_helmet: 'armor.iron_helmet',
    mage_hood: 'armor.mage_hood',
    cloth_vest: 'armor.cloth_vest',
    leather_armor: 'armor.leather_armor',
    iron_plate: 'armor.iron_plate',
    mage_robe: 'armor.mage_robe',
    scale_mail: 'armor.scale_mail',
    cloth_bracers: 'armor.cloth_bracers',
    iron_bracers: 'armor.iron_bracers',
    battle_bracers: 'armor.battle_bracers',
    mage_wraps: 'armor.mage_wraps',
    cloth_pants: 'armor.cloth_pants',
    iron_greaves: 'armor.iron_greaves',
    mage_leggings: 'armor.mage_leggings',
    swift_boots: 'armor.swift_boots',
    wind_boots: 'armor.wind_boots',
    leather_cap: 'armor.leather_cap',
    leather_bracers: 'armor.leather_bracers',
    leather_legs: 'armor.leather_legs',
    scale_helm: 'armor.scale_helm',
    scale_bracers: 'armor.scale_bracers',
    scale_legs: 'armor.scale_legs',
    stone_helm: 'armor.stone_helm',
    stone_plate: 'armor.stone_plate',
    stone_bracers: 'armor.stone_bracers',
    stone_legs: 'armor.stone_legs',
    skeleton_head: 'limb.skeleton_head',
    skeleton_arms: 'limb.skeleton_arms',
    skeleton_body: 'limb.skeleton_body',
    skeleton_legs: 'limb.skeleton_legs',
    orc_head: 'limb.orc_head',
    orc_arms: 'limb.orc_arms',
    orc_body: 'limb.orc_body',
    orc_legs: 'limb.orc_legs',
    elf_head: 'limb.elf_head',
    elf_arms: 'limb.elf_arms',
    elf_body: 'limb.elf_body',
    elf_legs: 'limb.elf_legs',
}

/** 护甲 / 肢体预设本地化显示名（未知 id 回退预设数据 `name`） */
export const armorPieceDisplayName = (piece: ArmorPieceConfig | LimbPieceConfig): string => {
    if (piece.nameKey !== undefined) return translate(piece.nameKey)
    const key = ARMOR_NAME_KEYS[piece.id]
    return key === undefined ? piece.name : translate(key)
}

/** 体形注册的额外护甲 / 肢体预设（非人形体形在 body_form/index.ts 装配时注册） */
const EXTRA_ARMOR_PRESETS = new Map<string, ArmorPieceConfig>()
const EXTRA_LIMB_PRESETS = new Map<string, LimbPieceConfig>()

export const registerArmorPresets = (pieces: readonly ArmorPieceConfig[]): void => {
    for (const piece of pieces) EXTRA_ARMOR_PRESETS.set(piece.id, piece)
}

export const registerLimbPresets = (pieces: readonly LimbPieceConfig[]): void => {
    for (const piece of pieces) EXTRA_LIMB_PRESETS.set(piece.id, piece)
}

/** 全部护甲预设（各体形注册；按 id 去重，面板下拉与测试枚举用） */
export const allArmorPresets = (): readonly ArmorPieceConfig[] => [...EXTRA_ARMOR_PRESETS.values()]

/** 全部肢体预设（各体形注册；按 id 去重，面板下拉与测试枚举用） */
export const allLimbPresets = (): readonly LimbPieceConfig[] => [...EXTRA_LIMB_PRESETS.values()]

/** 按 id 查护甲预设 */
export const findArmorPreset = (id: string | undefined): ArmorPieceConfig | undefined =>
    id === undefined ? undefined : EXTRA_ARMOR_PRESETS.get(id)

/** 按 id 查肢体预设 */
export const findLimbPreset = (id: string | undefined): LimbPieceConfig | undefined =>
    id === undefined ? undefined : EXTRA_LIMB_PRESETS.get(id)

/** 某槽位可选护甲（面板下拉用） */
export const armorPiecesOfSlot = (slot: string): readonly ArmorPieceConfig[] =>
    allArmorPresets().filter(piece => piece.slot === slot)

/** 某槽位可选肢体（面板下拉用） */
export const limbPiecesOfSlot = (slot: string): readonly LimbPieceConfig[] =>
    allLimbPresets().filter(piece => piece.slot === slot)

/** 校验护甲装备表：未知 id / 槽位与 id 不符 → 空槽 */
export const resolveArmorLoadout = (loadout: ArmorLoadout | undefined): ResolvedArmorLoadout => {
    const resolved: Record<string, ArmorPieceConfig> = {}
    if (loadout === undefined) return resolved
    for (const [slot, id] of Object.entries(loadout)) {
        const piece = findArmorPreset(id)
        if (piece !== undefined && piece.slot === slot) resolved[slot] = piece
    }
    return resolved
}

/** 校验肢体装备表：未知 id / 槽位与 id 不符 / null → 空槽（回退默认人类肢体） */
export const resolveLimbLoadout = (loadout: LimbLoadout | undefined): ResolvedLimbLoadout => {
    const resolved: Record<string, LimbPieceConfig> = {}
    if (loadout === undefined) return resolved
    for (const [slot, id] of Object.entries(loadout)) {
        const piece = findLimbPreset(id)
        if (piece !== undefined && piece.slot === slot) resolved[slot] = piece
    }
    return resolved
}

/** 已装备的护甲与肢体（按槽位顺序），供逐项数值来源展示 */
const equippedPieces = (
    resolved: ResolvedArmorLoadout,
    resolvedLimbs?: ResolvedLimbLoadout,
): readonly (ArmorPieceConfig | LimbPieceConfig)[] => {
    const pieces: (ArmorPieceConfig | LimbPieceConfig)[] = [
        ...Object.values(resolved),
    ]
    if (resolvedLimbs !== undefined) pieces.push(...Object.values(resolvedLimbs))
    return pieces
}

/** 逐项防御加值来源（仅列出非零项，名称已本地化） */
export const defenseTermsOf = (
    category: DamageType,
    resolved: ResolvedArmorLoadout,
    resolvedLimbs?: ResolvedLimbLoadout,
): StatTerm[] =>
    equippedPieces(resolved, resolvedLimbs)
        .map(piece => ({name: armorPieceDisplayName(piece), value: piece.defense[category]}))
        .filter(term => term.value > 0)

/** 逐项攻击加成来源（仅列出非零项，名称已本地化） */
export const attackTermsOf = (
    category: DamageType,
    resolved: ResolvedArmorLoadout,
    resolvedLimbs?: ResolvedLimbLoadout,
): StatTerm[] =>
    equippedPieces(resolved, resolvedLimbs)
        .map(piece => ({name: armorPieceDisplayName(piece), value: piece.attack[category]}))
        .filter(term => term.value > 0)

/** 逐项韧性加成来源（仅列出非零项，名称已本地化） */
export const poiseTermsOf = (
    resolved: ResolvedArmorLoadout,
    resolvedLimbs?: ResolvedLimbLoadout,
): StatTerm[] =>
    equippedPieces(resolved, resolvedLimbs)
        .map(piece => ({name: armorPieceDisplayName(piece), value: piece.poise ?? 0}))
        .filter(term => term.value > 0)

/** 逐项移速乘数来源（仅列出非 1 项，名称已本地化） */
export const moveSpeedTermsOf = (
    resolved: ResolvedArmorLoadout,
    resolvedLimbs?: ResolvedLimbLoadout,
): StatTerm[] =>
    equippedPieces(resolved, resolvedLimbs)
        .map(piece => ({name: armorPieceDisplayName(piece), value: piece.moveSpeedMultiplier}))
        .filter(term => term.value !== 1)

/* ── 通用装备状态解析（跨体形；按 kind:bodyPart 校验） ── */

/**
 * 解析装备状态中的护甲 / 肢体条目：未知 id、部位不匹配、体形不匹配一律剔除。
 * 同一部位的多层装备（kind 不同）各自独立保留。
 */
export const resolveEquipmentPieces = (
    state: EquipmentState,
    bodyFormId: string,
): readonly (ArmorPieceConfig | LimbPieceConfig)[] => {
    const pieces: (ArmorPieceConfig | LimbPieceConfig)[] = []
    const allowed = (piece: ArmorPieceConfig | LimbPieceConfig): boolean =>
        piece.allowedBodyFormIds === undefined || piece.allowedBodyFormIds.includes(bodyFormId)
    for (const [slot, id] of Object.entries(state.armor)) {
        const piece = findArmorPreset(id)
        if (piece !== undefined && piece.slot === slot && allowed(piece)) pieces.push(piece)
    }
    for (const [slot, id] of Object.entries(state.limb)) {
        const piece = findLimbPreset(id)
        if (piece !== undefined && piece.slot === slot && allowed(piece)) pieces.push(piece)
    }
    return pieces
}

/** 有效防御 = 基础防御 + 全部已解析护甲 / 肢体防御 */
export const equipmentDefenseOf = (base: DefenseProfile, pieces: readonly (ArmorPieceConfig | LimbPieceConfig)[]): DefenseProfile =>
    pieces.reduce((total, piece) => addDamageProfiles(total, piece.defense), base)

/** 有效攻击加成 = 全部已解析护甲 / 肢体攻击加成之和 */
export const equipmentAttackOf = (pieces: readonly (ArmorPieceConfig | LimbPieceConfig)[]): DamageTypeProfile =>
    pieces.reduce((total, piece) => addDamageProfiles(total, piece.attack), ZERO_PROFILE)

/** 有效移速乘数 = 全部已解析护甲 / 肢体移速乘数之积 */
export const equipmentMoveSpeedOf = (pieces: readonly (ArmorPieceConfig | LimbPieceConfig)[]): number =>
    pieces.reduce((multiplier, piece) => multiplier * piece.moveSpeedMultiplier, 1)

/** 有效韧性加成 = 全部已解析护甲 / 肢体韧性之和 */
export const equipmentPoiseOf = (pieces: readonly (ArmorPieceConfig | LimbPieceConfig)[]): number =>
    pieces.reduce((total, piece) => total + (piece.poise ?? 0), 0)
