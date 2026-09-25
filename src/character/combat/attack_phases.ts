/**
 * 攻击阶段模型与缓动函数（近战 / 远程通用）。
 * 具体武器的阶段序列与动画参数由武器模组声明（`character/weapon/melee_attacks.ts`、`ranged_attacks.ts`），
 * 本模块只提供阶段语义、缓动曲线与时长分摊规则。
 */

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

/** 回退单阶段：与重构前行为完全一致（无独立恢复段，duration 即全程） */
const FALLBACK_PHASE: AttackPhase = {
    name: 'strike', durationRatio: 1,
    moveSpeedMultiplier: 0.3, cancellable: false,
    animConfig: DEFAULT_ANIM,
}

/** 受击硬直持续时间（秒） */
export const FLINCH_DURATION = 0.1

/** 受击保护窗口（秒）：硬直结束后免再触发硬直的时长。
 *  无限连段每段都会清空 attackedTargets 反复命中同一目标，若无保护窗口，
 *  被击方每次重新起攻都会被下一击打断，永久锁在受击状态（stagger-lock）。
 *  取 0.5s > 轻链段间隔 0.4s，保证被击方至少一个完整的反击/脱身窗口；伤害不受影响。 */
export const FLINCH_IMMUNITY_DURATION = 0.5

/** 解析阶段数组：未定义时返回回退单阶段 */
export const resolvePhases = (phases: readonly AttackPhase[] | undefined): readonly AttackPhase[] =>
    phases !== undefined && phases.length > 0 ? phases : [FALLBACK_PHASE]

/**
 * 单阶段时长：recovery 阶段取段配置的恢复时间（segment.recovery），
 * 其余动作阶段按 durationRatio 从动作时间（segment.duration）中分摊（动作阶段比例和应为 1）。
 * 段总时长 = duration + recovery。
 */
export const phaseDurationOf = (phase: AttackPhase, duration: number, recovery: number): number =>
    phase.name === 'recovery' ? recovery : duration * phase.durationRatio
