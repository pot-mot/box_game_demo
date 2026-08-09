import type { MELEE_SKILL_PRESETS } from './melee_skill.ts'
import type { RANGED_SKILL_PRESETS } from './ranged_skill.ts'

/** 攻击阶段名常量集 */
export const ATTACK_PHASES = ['windup', 'strike', 'recovery', 'spin', 'draw', 'aim', 'release'] as const
export type AttackPhaseName = typeof ATTACK_PHASES[number]

/** 阶段缓动类型 */
export const EASING_TYPES = ['ease_in_out', 'ease_out', 'linear'] as const
export type EasingType = typeof EASING_TYPES[number]

/** 阶段动画参数 */
export interface AttackAnimConfig {
    readonly armSwingBackX: number
    readonly armSwingBackZ: number
    readonly armSwingForwardX: number
    readonly elbowBend: number
    readonly bodyLean: number
    readonly twoHanded: boolean
    readonly easing: EasingType
}

/** 攻击阶段配置 */
export interface AttackPhase {
    readonly name: AttackPhaseName
    readonly durationRatio: number
    readonly moveSpeedMultiplier: number
    readonly cancellable: boolean
    readonly animConfig: AttackAnimConfig
}

/** 默认动画参数 */
const DEFAULT_ANIM: AttackAnimConfig = {
    armSwingBackX: -1.5, armSwingBackZ: 0,
    armSwingForwardX: 2.0, elbowBend: 0.4,
    bodyLean: 0, twoHanded: false,
    easing: 'ease_in_out',
}

/** 回退单阶段：与重构前行为完全一致 */
const FALLBACK_PHASE: AttackPhase = {
    name: 'strike', durationRatio: 1,
    moveSpeedMultiplier: 0.3, cancellable: false,
    animConfig: DEFAULT_ANIM,
}

/** 近战阶段预设 — 按武器分类 */
export const MELEE_PHASE_PRESETS: Record<string, readonly AttackPhase[]> = {
    short_sword_slash: [
        {name: 'strike', durationRatio: 0.65, moveSpeedMultiplier: 0.4, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.6, armSwingForwardX: 1.0, elbowBend: 0.1}},
        {name: 'recovery', durationRatio: 0.35, moveSpeedMultiplier: 0.5, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: 1.0, armSwingForwardX: 0, elbowBend: 0}},
    ],
    long_sword_slash: [
        {name: 'windup', durationRatio: 0.2, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, elbowBend: 0.5}},
        {name: 'strike', durationRatio: 0.4, moveSpeedMultiplier: 0.1, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, armSwingForwardX: 2.0, elbowBend: 0.1}},
        {name: 'recovery', durationRatio: 0.4, moveSpeedMultiplier: 0.4, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: 2.0, armSwingForwardX: 0, elbowBend: 0}},
    ],
    heavy_sword_slam: [
        {name: 'windup', durationRatio: 0.35, moveSpeedMultiplier: 0.1, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -2.0, armSwingBackZ: 0, armSwingForwardX: 0, elbowBend: 0.8, twoHanded: true}},
        {name: 'strike', durationRatio: 0.3, moveSpeedMultiplier: 0, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -2.0, armSwingForwardX: 2.5, elbowBend: -0.1, twoHanded: true}},
        {name: 'recovery', durationRatio: 0.35, moveSpeedMultiplier: 0.2, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: 2.5, armSwingForwardX: 0, elbowBend: 0, twoHanded: true, easing: 'ease_out'}},
    ],
    spear_thrust: [
        {name: 'windup', durationRatio: 0.15, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.8, elbowBend: 0.3, twoHanded: true}},
        {name: 'strike', durationRatio: 0.35, moveSpeedMultiplier: 0.1, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.8, armSwingForwardX: 1.8, elbowBend: 0, twoHanded: true}},
        {name: 'recovery', durationRatio: 0.5, moveSpeedMultiplier: 0.4, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: 1.8, armSwingForwardX: 0, elbowBend: 0, twoHanded: true, easing: 'ease_out'}},
    ],
    dual_axe_spin: [
        {name: 'windup', durationRatio: 0.1, moveSpeedMultiplier: 0.5, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.5, armSwingBackZ: -3.0, armSwingForwardX: 0, elbowBend: 0.2}},
        {name: 'spin', durationRatio: 0.7, moveSpeedMultiplier: 0.5, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.5, armSwingBackZ: -3.0, armSwingForwardX: 0, elbowBend: 0.2}},
        {name: 'recovery', durationRatio: 0.2, moveSpeedMultiplier: 0.6, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.5, armSwingBackZ: 0, armSwingForwardX: 0, elbowBend: 0, easing: 'ease_out'}},
    ],
    war_hammer_smash: [
        {name: 'windup', durationRatio: 0.35, moveSpeedMultiplier: 0.08, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -2.2, armSwingBackZ: 0, armSwingForwardX: 0, elbowBend: 0.9, twoHanded: true, bodyLean: -0.2}},
        {name: 'strike', durationRatio: 0.25, moveSpeedMultiplier: 0, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -2.2, armSwingForwardX: 2.8, elbowBend: -0.15, twoHanded: true, bodyLean: 0.3}},
        {name: 'recovery', durationRatio: 0.4, moveSpeedMultiplier: 0.15, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: 2.8, armSwingForwardX: 0, elbowBend: 0, twoHanded: true, bodyLean: 0, easing: 'ease_out'}},
    ],
}

/** 远程阶段预设 — 按武器分类 */
export const RANGED_PHASE_PRESETS: Record<string, readonly AttackPhase[]> = {
    longbow_shot: [
        {name: 'draw', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.0, elbowBend: 0.6, twoHanded: true}},
        {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.2, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.0, elbowBend: 0.6, twoHanded: true}},
        {name: 'release', durationRatio: 0.4, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.0, armSwingForwardX: 1.2, elbowBend: 0, twoHanded: true}},
    ],
    crossbow_bolt: [
        {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.5, elbowBend: 0.4, twoHanded: true}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.5, armSwingForwardX: 0.8, elbowBend: 0.1, twoHanded: true}},
    ],
    shotgun_blast: [
        {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.2, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.6, elbowBend: 0.5, twoHanded: true}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.2, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.6, armSwingForwardX: 1.0, elbowBend: 0, bodyLean: -0.1, twoHanded: true}},
    ],
    staff_orb: [
        {name: 'aim', durationRatio: 0.4, moveSpeedMultiplier: 0.3, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.5, armSwingBackZ: 0, elbowBend: 0.3, twoHanded: true}},
        {name: 'release', durationRatio: 0.6, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.5, armSwingForwardX: 0.8, elbowBend: 0.1, twoHanded: true}},
    ],
    magic_wand_homing: [
        {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.4, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.3, elbowBend: 0.2}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.4, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.3, armSwingForwardX: 0.5, elbowBend: 0.1}},
    ],
    throwing_axe_hurl: [
        {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.4, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.0, armSwingBackZ: -0.5, elbowBend: 0.3, bodyLean: -0.15}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.0, armSwingForwardX: 1.5, armSwingBackZ: 0.5, elbowBend: 0, bodyLean: 0.1}},
    ],
    grenade_throw: [
        {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.2, armSwingBackZ: -0.3, elbowBend: 0.4, bodyLean: -0.15}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.2, armSwingForwardX: 1.8, armSwingBackZ: 0.3, elbowBend: 0, bodyLean: 0.1}},
    ],
    molotov_throw: [
        {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.2, armSwingBackZ: -0.3, elbowBend: 0.4, bodyLean: -0.15}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.2, armSwingForwardX: 1.8, armSwingBackZ: 0.3, elbowBend: 0, bodyLean: 0.1}},
    ],
    throwing_dart_fling: [
        {name: 'release', durationRatio: 1, moveSpeedMultiplier: 0.5, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.4, armSwingForwardX: 0.6, elbowBend: 0.1}},
    ],
}

/** 连招输入窗口（秒）—— 攻击结束后在此时间内接受下一招输入 */
export const COMBO_WINDOW = 0.3

/** 受击硬直持续时间（秒） */
export const FLINCH_DURATION = 0.25

/** 解析阶段数组：未定义时返回回退单阶段 */
export const resolvePhases = (phases: readonly AttackPhase[] | undefined): readonly AttackPhase[] =>
    phases !== undefined && phases.length > 0 ? phases : [FALLBACK_PHASE]

// ── 强类型推导 ──

type MeleeSkillId = keyof typeof MELEE_SKILL_PRESETS
type RangedSkillId = keyof typeof RANGED_SKILL_PRESETS

/** 编译期计算所有可能的攻击子状态名 */
export type AttackSubState = `attacking_${MeleeSkillId | RangedSkillId}_${AttackPhaseName}`
