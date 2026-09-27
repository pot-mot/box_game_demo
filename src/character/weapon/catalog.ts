import type {MeleeWeaponConfig} from './melee_weapon.ts'
import {MELEE_WEAPON_CLASSES, MELEE_WEAPON_MODELS, MELEE_WEAPON_PRESETS} from './melee_weapon.ts'
import type {RangedWeaponConfig} from './ranged_weapon.ts'
import {RANGED_WEAPON_CLASSES, RANGED_WEAPON_MODELS, RANGED_WEAPON_PRESETS} from './ranged_weapon.ts'
import type {HoldMode} from './hold_mode.ts'
import {HOLD_MODES} from './hold_mode.ts'
import type {WeaponAttacks} from './attack_chain.ts'
import {attacksForHoldMode} from './attack_chain.ts'

/**
 * 武器目录：近战 + 远程统一查询入口。
 * 角色实体只持有「装备的武器 + 数值覆写」，武器固有属性（含攻击链）一律由此查询。
 * 武器类 / 模型分层见 `weapon_class.ts`：玩法数据属于武器类，模型只提供外观与名称。
 */
export type WeaponConfig = MeleeWeaponConfig | RangedWeaponConfig
export type WeaponType = WeaponConfig['type']

/** 默认武器（存档/面板给出未知 id 时的回退，保持既有行为） */
export const DEFAULT_WEAPON_ID = 'long_sword'

/**
 * 额外武器注册表（测试专用武器用，如 test_weapon）：
 * 参与 `findWeaponPreset` 查询，但**不进入** `ALL_WEAPON_PRESETS`（面板下拉只列生产武器）。
 */
const EXTRA_WEAPON_PRESETS = new Map<string, WeaponConfig>()

/** 注册额外武器预设（同 id 覆盖；测试夹具在构造运行时前显式调用） */
export const registerWeaponPreset = (preset: WeaponConfig): void => {
    EXTRA_WEAPON_PRESETS.set(preset.id, preset)
}

/** 全部生产武器预设（近战在前、远程在后；面板下拉与校验用） */
export const ALL_WEAPON_PRESETS: readonly WeaponConfig[] = [
    ...Object.values(MELEE_WEAPON_PRESETS),
    ...Object.values(RANGED_WEAPON_PRESETS),
]

/** 按 id 查武器预设（近战 → 远程 → 额外注册，如测试武器） */
export const findWeaponPreset = (weaponId: string): WeaponConfig | undefined =>
    MELEE_WEAPON_PRESETS[weaponId] ?? RANGED_WEAPON_PRESETS[weaponId] ?? EXTRA_WEAPON_PRESETS.get(weaponId)

/** 按 id 查武器预设，未知 id 回退默认武器（存档/面板容错） */
export const weaponPresetOrDefault = (weaponId: string | undefined): WeaponConfig =>
    (weaponId !== undefined ? findWeaponPreset(weaponId) : undefined) ?? MELEE_WEAPON_PRESETS[DEFAULT_WEAPON_ID]

/** 武器是否属于存在的武器类（模型注册表与类注册表一致性的校验入口） */
export const isKnownWeaponClass = (classId: string): boolean =>
    MELEE_WEAPON_CLASSES[classId] !== undefined || RANGED_WEAPON_CLASSES[classId] !== undefined

/* ── 武器类 / 模型查询 ── */

/** 武器所属类 id（双持同类判定 / 展示分组用） */
export const weaponClassOf = (weapon: WeaponConfig): string => weapon.classId

/** 两把武器是否同类（同类的不同模型可互相双持） */
export const sameWeaponClass = (a: WeaponConfig, b: WeaponConfig): boolean => a.classId === b.classId

/** 是否为合法双持组合：主/副手均为近战且属于同一武器类 */
export const isDualWieldPair = (main: WeaponConfig, offhand: WeaponConfig | undefined): boolean =>
    offhand !== undefined && main.type === 'melee' && offhand.type === 'melee' && main.classId === offhand.classId

/**
 * 角色当前实际可用的持握模式：武器声明的模式中，双持额外要求副手为同类近战武器。
 * （武器数据仍以 `holdModes` 声明支持能力；可用性是角色级判定。）
 */
export const availableHoldModes = (weapon: WeaponConfig, offhand?: WeaponConfig): readonly HoldMode[] =>
    weapon.holdModes.filter(mode => mode !== 'dual_wield' || isDualWieldPair(weapon, offhand))

/** 武器支持的全部持握模式（数组首个 = 默认模式） */
export const weaponHoldModes = (weapon: WeaponConfig): readonly HoldMode[] => weapon.holdModes

/** 武器默认持握模式（换武器 / 未显式指定时使用） */
export const defaultHoldMode = (weapon: WeaponConfig): HoldMode => weapon.holdModes[0]

/** 武器是否支持某持握模式 */
export const supportsHoldMode = (weapon: WeaponConfig, holdMode: HoldMode): boolean =>
    weapon.holdModes.includes(holdMode)

/** 段 id 属于哪个持握模式的攻击链（枚举武器的全部已声明链；找不到返回 undefined） */
export const holdModeOfSegment = (weapon: WeaponConfig, segmentId: string): HoldMode | undefined =>
    HOLD_MODES.find(mode => attacksForHoldMode(weapon.attacks, mode)?.segments[segmentId] !== undefined)

/**
 * 取某持握模式的攻击链；未指定或该模式未声明时回退默认模式，
 * 默认模式也缺失（过渡期数据）时回退 `HOLD_MODES` 顺序中首个已声明模式。
 */
export const weaponAttacksOf = (weapon: WeaponConfig, holdMode?: HoldMode): WeaponAttacks => {
    const requested = holdMode !== undefined && supportsHoldMode(weapon, holdMode) ? holdMode : defaultHoldMode(weapon)
    const attacks = attacksForHoldMode(weapon.attacks, requested)
        ?? attacksForHoldMode(weapon.attacks, defaultHoldMode(weapon))
        ?? HOLD_MODES.map(mode => attacksForHoldMode(weapon.attacks, mode)).find(set => set !== undefined)
    if (attacks === undefined) {
        throw new Error(`武器 "${weapon.id}" 缺少攻击链（holdModes=${weapon.holdModes.join('/')}）`)
    }
    return attacks
}

/** 武器类 / 模型注册表一致性校验（近战 + 远程；测试与目录完整性检查用） */
export const weaponClassModelRegistry = (): {
    readonly classes: Readonly<Record<string, unknown>>
    readonly models: Readonly<Record<string, unknown>>
} => ({
    classes: {...MELEE_WEAPON_CLASSES, ...RANGED_WEAPON_CLASSES},
    models: {...MELEE_WEAPON_MODELS, ...RANGED_WEAPON_MODELS},
})
