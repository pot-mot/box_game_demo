import type {MeleeWeaponConfig} from './melee_weapon.ts'
import {MELEE_WEAPON_PRESETS} from './melee_weapon.ts'
import type {RangedWeaponConfig} from './ranged_weapon.ts'
import {RANGED_WEAPON_PRESETS} from './ranged_weapon.ts'
import type {HoldMode} from './hold_mode.ts'
import type {WeaponAttacks} from './attack_chain.ts'
import {attacksForHoldMode} from './attack_chain.ts'

/**
 * 武器目录：近战 + 远程统一查询入口。
 * 角色实体只持有「装备的武器 + 数值覆写」，武器固有属性（含攻击链）一律由此查询。
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

/** 武器支持的全部持握模式（数组首个 = 默认模式） */
export const weaponHoldModes = (weapon: WeaponConfig): readonly HoldMode[] => weapon.holdModes

/** 武器默认持握模式（换武器 / 未显式指定时使用） */
export const defaultHoldMode = (weapon: WeaponConfig): HoldMode => weapon.holdModes[0]

/** 武器是否支持某持握模式 */
export const supportsHoldMode = (weapon: WeaponConfig, holdMode: HoldMode): boolean =>
    weapon.holdModes.includes(holdMode)

/**
 * 取某持握模式的攻击链；未指定或该模式未声明时回退默认模式，
 * 默认模式也缺失（异常数据）时回退首个已声明模式。
 */
export const weaponAttacksOf = (weapon: WeaponConfig, holdMode?: HoldMode): WeaponAttacks => {
    const requested = holdMode !== undefined && supportsHoldMode(weapon, holdMode) ? holdMode : defaultHoldMode(weapon)
    const attacks = attacksForHoldMode(weapon.attacks, requested)
        ?? attacksForHoldMode(weapon.attacks, defaultHoldMode(weapon))
    if (attacks === undefined) {
        throw new Error(`武器 "${weapon.id}" 缺少攻击链（holdModes=${weapon.holdModes.join('/')}）`)
    }
    return attacks
}
