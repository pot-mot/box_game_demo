import type { MeleeWeaponConfig } from '../weapon/melee_weapon.ts'
import { MELEE_WEAPON_PRESETS } from '../weapon/melee_weapon.ts'
import type { AttackPhase, AttackAnimConfig } from './attack_phases.ts'
import { DEFAULT_ANIM } from './attack_phases.ts'
import type { SkillSlot } from './skill_types.ts'

/** 近战技能配置 — 动作层参数 + 武器引用 */
export interface MeleeSkillConfig {
    readonly id: string
    readonly type: 'melee'
    /** 冷却时间（秒）— 普通攻击为 0；非 0 时从触发时刻开始计时，只挡起手 */
    readonly cooldown: number
    /** 动作时间（秒）— 动作阶段（windup/strike 等，不含恢复）的总时长 */
    readonly duration: number
    /** 恢复时间（秒）— 动作结束后的后摇时长（0 = 无恢复段） */
    readonly recovery: number
    readonly weapon: MeleeWeaponConfig
    /** 攻击阶段序列（undefined = 使用默认单阶段） */
    readonly phases?: readonly AttackPhase[]
    /** 段固有挥砍倾斜角（rad，0=竖劈，±PI/2=横斩）；undefined = 0 */
    readonly swingTilt?: number
}

/* ── 链段节奏（短剑精调基准，其余近战沿用，后续逐一修正） ── */

/** 轻段动作时间（秒）— 仅挥砍动作，不含后摇 */
export const MELEE_LIGHT_DURATION = 0.2
/** 重段动作时间（秒）— 仅挥砍动作，不含后摇 */
export const MELEE_HEAVY_DURATION = 0.3
/** 轻段恢复时间（秒）— 动作结束后的后摇 */
export const MELEE_LIGHT_RECOVERY = 0.2
/** 重段恢复时间（秒）— 动作结束后的后摇 */
export const MELEE_HEAVY_RECOVERY = 0.2
/** 重段伤害倍率（相对武器基础伤害） */
const HEAVY_DAMAGE_MULTIPLIER = 1.6

/** 链段槽后缀：_1 = 起手段（对应轻/重击键），_2 = 后续段 */
export const MELEE_CHAIN_SLOTS = ['light_1', 'heavy_1', 'light_2', 'heavy_2'] as const
export type MeleeChainSlot = typeof MELEE_CHAIN_SLOTS[number]

/** 技能槽装配顺序：槽 0 = 轻击键起手、槽 1 = 重击键起手 */
export const MELEE_SKILL_SLOT_ORDER: readonly MeleeChainSlot[] = ['light_1', 'heavy_1', 'light_2', 'heavy_2']

/** 每武器链段动作风格：幅度系数（短剑 1.0 = 小而快）+ 是否双手持握 */
interface MeleeChainStyle {
    readonly amp: number
    readonly twoHanded: boolean
}

const MELEE_CHAIN_STYLES: Record<string, MeleeChainStyle> = {
    short_sword: {amp: 1.0, twoHanded: false},
    long_sword: {amp: 1.25, twoHanded: false},
    heavy_sword: {amp: 1.5, twoHanded: true},
    spear: {amp: 1.2, twoHanded: true},
    dual_axe: {amp: 1.15, twoHanded: false},
    war_hammer: {amp: 1.5, twoHanded: true},
}

const DEFAULT_CHAIN_STYLE: MeleeChainStyle = {amp: 1.2, twoHanded: false}

/* ── 段阶段序列生成（strike + recovery 两段式） ── */

/** 打击段动画参数（按段动作语义） */
const strikeAnim = (slot: MeleeChainSlot, style: MeleeChainStyle): AttackAnimConfig => {
    const {amp, twoHanded} = style
    switch (slot) {
        case 'light_1':
            /* 上至下竖劈：幅度小而快 */
            return {...DEFAULT_ANIM, armSwingForwardX: 2.0 * amp, elbowBend: 0.25, bodyLean: 0.06, attackType: 'slash', strikePeakRatio: 0.7, overshootRatio: 0.15, twoHanded}
        case 'light_2':
            /* 水平向前直刺：探身 + 手臂前伸 */
            return {...DEFAULT_ANIM, armSwingForwardX: 1.6 * amp, elbowBend: 0.15, bodyLean: 0.12, attackType: 'thrust', strikePeakRatio: 0.6, overshootRatio: 0.1, twoHanded}
        case 'heavy_1':
            /* 水平横向挥砍：拧腰动力链大幅横摆 */
            return {...DEFAULT_ANIM, armSwingForwardX: 2.4 * amp, elbowBend: 0.3, bodyLean: 0.05, attackType: 'slash', strikePeakRatio: 0.75, overshootRatio: 0.2, twoHanded}
        case 'heavy_2':
            /* 斜向挥砍 */
            return {...DEFAULT_ANIM, armSwingForwardX: 2.3 * amp, elbowBend: 0.3, bodyLean: 0.06, attackType: 'slash', strikePeakRatio: 0.7, overshootRatio: 0.18, twoHanded}
    }
}

/** 段固有倾斜角：轻 1 竖劈 / 重 1 横斩（左向）/ 重 2 斜劈（右向），轻 2 直刺不受倾斜角影响 */
const segmentTilt = (slot: MeleeChainSlot): number => {
    switch (slot) {
        case 'heavy_1': return Math.PI * 0.48
        case 'heavy_2': return -Math.PI * 0.22
        default: return 0
    }
}

/** 生成单个链段的阶段序列（strike 动作段 + recovery 恢复段；
 * strike 时长由 config.duration 决定（ratio = 1），recovery 时长取 config.recovery（ratio 不参与计算） */
const buildSegmentPhases = (slot: MeleeChainSlot, style: MeleeChainStyle): readonly AttackPhase[] => {
    return [
        {name: 'strike', durationRatio: 1, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: strikeAnim(slot, style)},
        {name: 'recovery', durationRatio: 0, moveSpeedMultiplier: 0.35, cancellable: false, animConfig: {...DEFAULT_ANIM, elbowBend: 0.2, bodyLean: 0, twoHanded: style.twoHanded}},
    ]
}

/** 生成单武器的 4 个链段配置 */
const buildWeaponChainConfigs = (weaponId: string): Record<MeleeChainSlot, MeleeSkillConfig> => {
    const weapon = MELEE_WEAPON_PRESETS[weaponId] ?? MELEE_WEAPON_PRESETS.long_sword
    const style = MELEE_CHAIN_STYLES[weapon.id] ?? DEFAULT_CHAIN_STYLE
    const make = (slot: MeleeChainSlot): MeleeSkillConfig => {
        const isLight = slot === 'light_1' || slot === 'light_2'
        return {
            id: `${weapon.id}_${slot}`,
            type: 'melee',
            /* 普通攻击无冷却：节奏由动作时间 + 恢复时间自然形成 */
            cooldown: 0,
            duration: isLight ? MELEE_LIGHT_DURATION : MELEE_HEAVY_DURATION,
            recovery: isLight ? MELEE_LIGHT_RECOVERY : MELEE_HEAVY_RECOVERY,
            weapon,
            phases: buildSegmentPhases(slot, style),
            swingTilt: segmentTilt(slot),
        }
    }
    return {light_1: make('light_1'), heavy_1: make('heavy_1'), light_2: make('light_2'), heavy_2: make('heavy_2')}
}

/** 近战链段预设：每把近战武器 4 段（{weaponId}_{light|heavy}_{1|2}） */
export const MELEE_SKILL_PRESETS: Record<string, MeleeSkillConfig> = (() => {
    const out: Record<string, MeleeSkillConfig> = {}
    for (const weaponId of Object.keys(MELEE_WEAPON_PRESETS)) {
        const chain = buildWeaponChainConfigs(weaponId)
        for (const slot of MELEE_CHAIN_SLOTS) {
            out[chain[slot].id] = chain[slot]
        }
    }
    return out
})()

/** buildMeleeSkillSlots 覆写项 — 存档 AttackConfig 的数值注入 */
export interface MeleeSkillSlotOverrides {
    readonly damage?: number
    readonly range?: number
}

/**
 * 装配近战武器技能槽：[轻1, 重1, 轻2, 重2]
 * - 槽 0 = 轻击键起手、槽 1 = 重击键起手
 * - 循环链：轻1↔轻2、重1↔重2（comboChain 指向链中下一段）
 * - 起手槽标 isChainEntry；普通攻击冷却恒 0（节奏由动作/恢复时间形成）
 * - 伤害/侦测范围可被存档覆写，段时长/阶段/链结构取预设
 */
export const buildMeleeSkillSlots = (weaponId: string, overrides: MeleeSkillSlotOverrides = {}): SkillSlot[] => {
    const baseWeapon = MELEE_WEAPON_PRESETS[weaponId] ?? MELEE_WEAPON_PRESETS.long_sword
    const weaponOf = (damageMul: number): MeleeWeaponConfig => ({
        ...baseWeapon,
        damage: (overrides.damage ?? baseWeapon.damage) * damageMul,
        range: overrides.range ?? baseWeapon.range,
    })
    const configOf = (slot: MeleeChainSlot, damageMul: number): MeleeSkillConfig => {
        const preset = MELEE_SKILL_PRESETS[`${baseWeapon.id}_${slot}`]
        return {...preset, weapon: weaponOf(damageMul)}
    }
    return [
        {config: configOf('light_1', 1), cooldownTimer: 0, comboChain: [`${baseWeapon.id}_light_2`], isChainEntry: true},
        {config: configOf('heavy_1', HEAVY_DAMAGE_MULTIPLIER), cooldownTimer: 0, comboChain: [`${baseWeapon.id}_heavy_2`], isChainEntry: true},
        {config: configOf('light_2', 1), cooldownTimer: 0, comboChain: [`${baseWeapon.id}_light_1`]},
        {config: configOf('heavy_2', HEAVY_DAMAGE_MULTIPLIER), cooldownTimer: 0, comboChain: [`${baseWeapon.id}_heavy_1`]},
    ]
}
