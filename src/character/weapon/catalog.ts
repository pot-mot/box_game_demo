import type {MeleeWeaponConfig} from './melee_weapon.ts'
import type {RangedWeaponConfig} from './ranged_weapon.ts'
import type {HoldMode} from './hold_mode.ts'
import {HOLD_MODES} from './hold_mode.ts'
import type {WeaponAttacks} from './attack_chain.ts'
import {attacksForHoldMode} from './attack_chain.ts'
import {translate} from '../../i18n/index.ts'

/**
 * 武器目录：近战 + 远程统一查询入口。
 * 角色实体只持有「装备的武器 + 数值覆写」，武器固有属性（含攻击链）一律由此查询。
 *
 * **体形归属**：武器数据由各体形的 `forms/<form>/weapons.ts` 声明，`BodyForm.weapons` 暴露；
 * 注册表在 `body_form/index.ts` 装配 `BODY_FORMS` 时经 `registerFormWeapons` 填充。
 * 每个武器只属于一种体形（`weapon.formId === form.id`）。
 */
export type WeaponConfig = MeleeWeaponConfig | RangedWeaponConfig
export type WeaponType = WeaponConfig['type']

/** 体形默认武器 id（存档 / 面板给出未知 id 且该体形无更合适回退时的最后兜底） */
export const DEFAULT_WEAPON_ID = 'long_sword'

/* ── 注册表（由体形装配时填充） ── */

const WEAPONS_BY_FORM = new Map<string, WeaponConfig[]>()
const WEAPON_BY_ID = new Map<string, WeaponConfig>()

/** 注册某体形的武器表（`body_form/index.ts` 装配时调用；同 id 覆盖，列表按体形归并） */
export const registerFormWeapons = (formId: string, weapons: readonly WeaponConfig[]): void => {
    const list = WEAPONS_BY_FORM.get(formId) ?? []
    for (const weapon of weapons) {
        WEAPON_BY_ID.set(weapon.id, weapon)
        list.push(weapon)
    }
    WEAPONS_BY_FORM.set(formId, list)
}

/** 某体形的全部武器（面板下拉 / 存档校验用） */
export const weaponsOfForm = (formId: string): readonly WeaponConfig[] => WEAPONS_BY_FORM.get(formId) ?? []

/** 全部已注册武器（近战在前、远程在后按体形注册顺序） */
export const allWeaponPresets = (): readonly WeaponConfig[] => [...WEAPON_BY_ID.values()]

/** 按 id 查武器（体形注册表） */
export const findWeaponPreset = (weaponId: string): WeaponConfig | undefined => WEAPON_BY_ID.get(weaponId)

/** 按 id 查武器，未知 id 回退默认武器（存档 / 面板容错） */
export const weaponPresetOrDefault = (weaponId: string | undefined): WeaponConfig => {
    const found = weaponId !== undefined ? findWeaponPreset(weaponId) : undefined
    if (found !== undefined) return found
    const fallback = findWeaponPreset(DEFAULT_WEAPON_ID)
    if (fallback !== undefined) return fallback
    const first = WEAPON_BY_ID.values().next().value
    if (first !== undefined) return first
    throw new Error('武器目录为空：未注册任何体形武器（body_form/index.ts 是否已装配？）')
}

/** 武器本地化显示名（经武器自带 `nameKey` 取用；键缺失 / 空值时回退模型名） */
export const weaponDisplayName = (weapon: WeaponConfig): string => {
    const name = translate(weapon.nameKey)
    return typeof name === 'string' && name.length > 0 ? name : weapon.name
}

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

/** 武器类 / 模型注册表快照（目录完整性检查用） */
export const weaponClassModelRegistry = (): {
    readonly classes: Readonly<Record<string, unknown>>
    readonly models: Readonly<Record<string, unknown>>
} => {
    const classes: Record<string, unknown> = {}
    const models: Record<string, unknown> = {}
    for (const weapon of allWeaponPresets()) {
        classes[weapon.classId] = weapon
        models[weapon.id] = weapon
    }
    return {classes, models}
}
