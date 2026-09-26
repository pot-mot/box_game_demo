import type {WeaponAttacks, AttackSegment, HoldModeAttacks} from './attack_chain.ts'
import {ATTACK_KEYS} from './attack_chain.ts'
import type {WeaponConfig} from './catalog.ts'
import {defaultHoldMode, findWeaponPreset, weaponAttacksOf, weaponPresetOrDefault} from './catalog.ts'
import {HOLD_MODES, type HoldMode} from './hold_mode.ts'
import type {MeleeWeaponConfig} from './melee_weapon.ts'
import type {RangedWeaponConfig} from './ranged_weapon.ts'

/**
 * 武器运行时 = 武器预设 + 当前持握模式 + 角色/存档数值覆写（伤害、起手段冷却、远程弹道参数）。
 * 攻击动作（段/阶段时序/时长/关键帧动画）**不可覆写**：由武器模组决定；
 * `attacks` 为**当前持握模式**解析后的攻击链（换持握模式时重建运行时）。
 */
export interface WeaponRuntime {
    readonly weapon: WeaponConfig
    readonly holdMode: HoldMode
    readonly attacks: WeaponAttacks
}

/** 数值覆写项（存档/面板给出，缺省取武器预设） */
export interface WeaponOverrides {
    readonly damage?: number
    /** 起手段冷却覆写（秒）：作用于该武器全部起手段，链中段保持预设（普通攻击为 0） */
    readonly cooldown?: number
    readonly ranged?: {
        readonly range: number
        readonly bulletSpeed: number
        readonly bulletKnockback: number
        readonly bulletLifetime: number
    }
}

/** 是否为起手段（出现在任一攻击键的起手候选中） */
const isEntrySegment = (attacks: WeaponAttacks, segmentId: string): boolean =>
    ATTACK_KEYS.some(key => attacks.chains[key].entries.some(entry => entry.segmentId === segmentId))

/** 应用起手段冷却覆写（段定义按 id 拷贝，不修改武器预设共享数据） */
const withCooldownOverride = (attacks: WeaponAttacks, cooldown: number | undefined): WeaponAttacks => {
    if (cooldown === undefined) return attacks
    const segments: Record<string, AttackSegment> = {}
    for (const [segmentId, segment] of Object.entries(attacks.segments)) {
        segments[segmentId] = isEntrySegment(attacks, segmentId) ? {...segment, cooldown} : segment
    }
    return {...attacks, segments}
}

/** 对持握模式 map 的**每个**模式应用起手段冷却覆写（换持握模式时覆写不丢失） */
const withCooldownOverrideMap = (attacks: HoldModeAttacks, cooldown: number | undefined): HoldModeAttacks => {
    if (cooldown === undefined) return attacks
    const out: Partial<Record<HoldMode, WeaponAttacks>> = {}
    for (const mode of HOLD_MODES) {
        const set = attacks[mode]
        if (set !== undefined) out[mode] = withCooldownOverride(set, cooldown)
    }
    return out
}

/** 近战武器数值覆写（全部字段缺省 = 取预设；冷却覆写烘焙进各持握模式的攻击链） */
const applyMeleeOverrides = (preset: MeleeWeaponConfig, overrides: WeaponOverrides): MeleeWeaponConfig => ({
    ...preset,
    damage: overrides.damage ?? preset.damage,
    attacks: withCooldownOverrideMap(preset.attacks, overrides.cooldown),
})

/** 远程武器数值覆写（伤害 + 弹道参数；缺省 = 取预设；冷却覆写烘焙进各持握模式的攻击链） */
const applyRangedOverrides = (preset: RangedWeaponConfig, overrides: WeaponOverrides): RangedWeaponConfig => ({
    ...preset,
    damage: overrides.damage ?? preset.damage,
    attacks: withCooldownOverrideMap(preset.attacks, overrides.cooldown),
    range: overrides.ranged?.range ?? preset.range,
    projectileSpeed: overrides.ranged?.bulletSpeed ?? preset.projectileSpeed,
    knockbackForce: overrides.ranged?.bulletKnockback ?? preset.knockbackForce,
    projectileLifetime: overrides.ranged?.bulletLifetime ?? preset.projectileLifetime,
})

/** 创建武器运行时：未知武器 id 回退默认武器（存档容错），解析指定/默认持握模式的攻击链，再应用数值覆写 */
export const createWeaponRuntime = (
    weaponId: string | undefined,
    overrides: WeaponOverrides = {},
    holdMode?: HoldMode,
): WeaponRuntime => {
    const preset = weaponPresetOrDefault(weaponId)
    const weapon = preset.type === 'melee'
        ? applyMeleeOverrides(preset, overrides)
        : applyRangedOverrides(preset, overrides)
    const mode = holdMode !== undefined && weapon.holdModes.includes(holdMode) ? holdMode : defaultHoldMode(weapon)
    return {
        weapon,
        holdMode: mode,
        attacks: weaponAttacksOf(weapon, mode),
    }
}

/** 武器 id 是否存在于预设目录（面板/存档校验提示用） */
export const isKnownWeaponId = (weaponId: string): boolean => findWeaponPreset(weaponId) !== undefined
