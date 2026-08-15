import type { MELEE_SKILL_PRESETS } from './melee_skill.ts'
import type { RANGED_SKILL_PRESETS } from './ranged_skill.ts'

/** 攻击阶段名常量集 */
export const ATTACK_PHASES = ['windup', 'strike', 'recovery', 'spin', 'draw', 'aim', 'release'] as const
export type AttackPhaseName = typeof ATTACK_PHASES[number]

/** 阶段缓动类型 */
export const EASING_TYPES = ['ease_in_out', 'ease_out', 'linear'] as const
export type EasingType = typeof EASING_TYPES[number]

/** 攻击动作类型：slash=挥砍弧线 thrust=直线刺击 spin=旋转横扫 */
export const ATTACK_TYPES = ['slash', 'thrust', 'spin'] as const
export type AttackType = typeof ATTACK_TYPES[number]

/** 阶段动画参数 */
export interface AttackAnimConfig {
    readonly armSwingBackX: number
    readonly armSwingBackZ: number
    readonly armSwingForwardX: number
    readonly elbowBend: number
    readonly bodyLean: number
    readonly twoHanded: boolean
    readonly easing: EasingType
    /** 动作类型判别字段 — 决定动画器使用哪套关节驱动语义 */
    readonly attackType: AttackType
    /** 打击阶段速度峰值位置（0-1，>峰值减速 <峰值加速，拟真挥砍的末端加速） */
    readonly strikePeakRatio: number
    /** 恢复阶段惯性过冲比例（0-1，沿打击方向的过冲回弹幅度） */
    readonly overshootRatio: number
}

/**
 * 缓动函数：将线性进度 p 映射为缓动后进度
 * - linear：恒速
 * - ease_out：先快后慢（蓄力进入固定位、恢复收尾）
 * - ease_in_out：慢-快-慢（基础挥砍）
 */
export const applyEasing = (p: number, easing: EasingType): number => {
    const t = Math.min(Math.max(p, 0), 1)
    switch (easing) {
        case 'linear': return t
        case 'ease_out': return 1 - Math.pow(1 - t, 3)
        case 'ease_in_out': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    }
}

/**
 * 打击曲线：峰值前持续加速（二次 ease-in）、峰值后衰减（二次 ease-out），
 * 速度峰值出现在 strikePeakRatio 处 — 拟真挥砍的"末端加速"动力学
 * （区别于 ease_in_out 的中点最快）。两段在峰值处速度连续。
 */
export const strikeCurve = (p: number, peak: number): number => {
    const t = Math.min(Math.max(p, 0), 1)
    const k = Math.min(Math.max(peak, 0), 1)
    if (k <= 0) return 1 - (1 - t) * (1 - t)
    if (k >= 1) return t * t
    if (t < k) return (t * t) / k
    const u = (t - k) / (1 - k)
    return k + (1 - k) * (1 - (1 - u) * (1 - u))
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
export const DEFAULT_ANIM: AttackAnimConfig = {
    armSwingBackX: -1.5, armSwingBackZ: 0,
    armSwingForwardX: 2.0, elbowBend: 0.4,
    bodyLean: 0, twoHanded: false,
    easing: 'ease_in_out',
    attackType: 'slash',
    strikePeakRatio: 0.7,
    overshootRatio: 0.1,
}

/** 回退单阶段：与重构前行为完全一致 */
const FALLBACK_PHASE: AttackPhase = {
    name: 'strike', durationRatio: 1,
    moveSpeedMultiplier: 0.3, cancellable: false,
    animConfig: DEFAULT_ANIM,
}

/**
 * 近战阶段预设 — 按武器分类。
 *
 * 动画语义（各阶段定义"阶段末姿态"，相邻阶段自动链式衔接）：
 * - windup/draw：末姿态 = {X: backX·cosTilt, Z: backZ + backX·sinTilt, 肘: elbowBend, 前倾: bodyLean}
 * - aim/spin：维持蓄力姿态（同 windup 末姿态）
 * - strike/release：末姿态 = {X: forwardX·cosTilt, Z: forwardX·sinTilt, 肘: elbowBend, 前倾: bodyLean}
 * - recovery：末姿态 = 归位（X/Z 归零，肘/前倾取本阶段配置）
 */
export const MELEE_PHASE_PRESETS: Record<string, readonly AttackPhase[]> = {
    short_sword_slash: [
        {name: 'strike', durationRatio: 0.65, moveSpeedMultiplier: 0.4, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.6, armSwingForwardX: 1.0, elbowBend: 0.1, bodyLean: 0.08}},
        {name: 'recovery', durationRatio: 0.35, moveSpeedMultiplier: 0.5, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: 1.0, armSwingForwardX: 0, elbowBend: 0, bodyLean: 0}},
    ],
    long_sword_slash: [
        {name: 'windup', durationRatio: 0.2, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, elbowBend: 0.5}},
        {name: 'strike', durationRatio: 0.4, moveSpeedMultiplier: 0.1, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, armSwingForwardX: 2.0, elbowBend: 0.1, bodyLean: 0.12}},
        {name: 'recovery', durationRatio: 0.4, moveSpeedMultiplier: 0.4, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: 2.0, armSwingForwardX: 0, elbowBend: 0, bodyLean: 0}},
    ],
    heavy_sword_slam: [
        {name: 'windup', durationRatio: 0.35, moveSpeedMultiplier: 0.1, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -2.0, armSwingBackZ: 0, armSwingForwardX: 0, elbowBend: 0.8, bodyLean: -0.12, twoHanded: true}},
        {name: 'strike', durationRatio: 0.3, moveSpeedMultiplier: 0, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -2.0, armSwingForwardX: 2.5, elbowBend: -0.1, bodyLean: 0.2, twoHanded: true}},
        {name: 'recovery', durationRatio: 0.35, moveSpeedMultiplier: 0.2, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: 2.5, armSwingForwardX: 0, elbowBend: 0, bodyLean: 0, twoHanded: true, easing: 'ease_out'}},
    ],
    spear_thrust: [
        {name: 'windup', durationRatio: 0.15, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.4, elbowBend: 0.9, attackType: 'thrust', twoHanded: true}},
        {name: 'strike', durationRatio: 0.35, moveSpeedMultiplier: 0.1, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.4, armSwingForwardX: -1.2, elbowBend: 0, bodyLean: 0.15, attackType: 'thrust', twoHanded: true}},
        {name: 'recovery', durationRatio: 0.5, moveSpeedMultiplier: 0.4, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.2, armSwingForwardX: 0, elbowBend: 0.15, attackType: 'thrust', twoHanded: true, easing: 'ease_out'}},
    ],
    dual_axe_spin: [
        {name: 'windup', durationRatio: 0.1, moveSpeedMultiplier: 0.5, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.5, armSwingBackZ: -3.0, armSwingForwardX: 0, elbowBend: 0.2, attackType: 'spin'}},
        {name: 'spin', durationRatio: 0.7, moveSpeedMultiplier: 0.5, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.5, armSwingBackZ: -3.0, armSwingForwardX: 0, elbowBend: 0.2, attackType: 'spin'}},
        {name: 'recovery', durationRatio: 0.2, moveSpeedMultiplier: 0.6, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.5, armSwingBackZ: 0, armSwingForwardX: 0, elbowBend: 0, attackType: 'spin', easing: 'ease_out'}},
    ],
    war_hammer_smash: [
        {name: 'windup', durationRatio: 0.35, moveSpeedMultiplier: 0.08, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -2.2, armSwingBackZ: 0, armSwingForwardX: 0, elbowBend: 0.9, bodyLean: -0.2, twoHanded: true}},
        {name: 'strike', durationRatio: 0.25, moveSpeedMultiplier: 0, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -2.2, armSwingForwardX: 2.8, elbowBend: -0.15, bodyLean: 0.3, twoHanded: true}},
        {name: 'recovery', durationRatio: 0.4, moveSpeedMultiplier: 0.15, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: 2.8, armSwingForwardX: 0, elbowBend: 0, bodyLean: 0, twoHanded: true, easing: 'ease_out'}},
    ],
}

/** 远程阶段预设 — 按武器分类（swingTilt=0，X 幅值直接生效） */
export const RANGED_PHASE_PRESETS: Record<string, readonly AttackPhase[]> = {
    longbow_shot: [
        {name: 'draw', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, elbowBend: 0.15, twoHanded: true}},
        {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.2, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, elbowBend: 0.15, twoHanded: true}},
        {name: 'release', durationRatio: 0.4, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, armSwingForwardX: -1.35, elbowBend: 0.1, twoHanded: true}},
    ],
    crossbow_bolt: [
        {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, elbowBend: 0.1, twoHanded: true}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.5, armSwingForwardX: -1.4, elbowBend: 0.08, twoHanded: true}},
    ],
    shotgun_blast: [
        {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.2, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.4, elbowBend: 0.5, twoHanded: true}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.2, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.4, armSwingForwardX: -1.3, elbowBend: 0.45, bodyLean: -0.1, twoHanded: true}},
    ],
    staff_orb: [
        {name: 'aim', durationRatio: 0.4, moveSpeedMultiplier: 0.3, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.4, armSwingBackZ: 0, elbowBend: 0.1, twoHanded: true}},
        {name: 'release', durationRatio: 0.6, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.4, armSwingForwardX: -1.3, elbowBend: 0.08, twoHanded: true}},
    ],
    magic_wand_homing: [
        {name: 'aim', durationRatio: 0.3, moveSpeedMultiplier: 0.4, cancellable: true, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.2, elbowBend: 0.1}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.4, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.2, armSwingForwardX: -1.1, elbowBend: 0.08}},
    ],
    throwing_axe_hurl: [
        {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.4, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingBackZ: -0.4, elbowBend: 0.8, bodyLean: -0.1}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingForwardX: 1.6, armSwingBackZ: -0.4, elbowBend: 0.1, bodyLean: 0.15}},
    ],
    grenade_throw: [
        {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingBackZ: -0.4, elbowBend: 0.8, bodyLean: -0.1}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingForwardX: 1.6, armSwingBackZ: -0.4, elbowBend: 0.1, bodyLean: 0.15}},
    ],
    molotov_throw: [
        {name: 'windup', durationRatio: 0.3, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingBackZ: -0.4, elbowBend: 0.8, bodyLean: -0.1}},
        {name: 'release', durationRatio: 0.7, moveSpeedMultiplier: 0.3, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -1.8, armSwingForwardX: 1.6, armSwingBackZ: -0.4, elbowBend: 0.1, bodyLean: 0.15}},
    ],
    throwing_dart_fling: [
        {name: 'release', durationRatio: 1, moveSpeedMultiplier: 0.5, cancellable: false, animConfig: {...DEFAULT_ANIM, armSwingBackX: -0.9, armSwingForwardX: 0.6, elbowBend: 0.1}},
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
