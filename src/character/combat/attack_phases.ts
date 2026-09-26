/**
 * 攻击阶段模型（仅玩法时序与中断语义）。
 * 动画不再通过参数表达——每个攻击段的骨骼动画是显式关键帧数据（`character/weapon/attack_clip_data.ts`，
 * 由骨骼动画系统播放）。本模块只保留阶段名、时长分摊与可中断性，供状态机与 HUD 使用。
 */

/** 攻击阶段名常量集 */
export const ATTACK_PHASES = ['windup', 'strike', 'recovery', 'spin', 'draw', 'aim', 'release'] as const
export type AttackPhaseName = typeof ATTACK_PHASES[number]

/** 攻击阶段配置（不含量化动画参数） */
export interface AttackPhase {
    /** 阶段名，构成阶段子状态 key "attacking_{segmentId}_{name}" */
    readonly name: AttackPhaseName
    /** 占动作时间的比例（0-1），动作阶段（非 recovery）比例之和应为 1；
     *  recovery 阶段不参与分摊，时长直接取所属段的 recovery */
    readonly durationRatio: number
    /** 移速倍率：0 = 完全定身，1 = 全速移动 */
    readonly moveSpeedMultiplier: number
    /** 是否可被 dash / jump 打断（combo 输入走段末缓冲，不受此限制） */
    readonly cancellable: boolean
}

/** 受击硬直持续时间（秒） */
export const FLINCH_DURATION = 0.1

/** 受击保护窗口（秒）：硬直结束后免再触发硬直的时长。
 *  无限连段每段都会清空 attackedTargets 反复命中同一目标，若无保护窗口，
 *  被击方每次重新起攻都会被下一击打断，永久锁在受击状态（stagger-lock）。
 *  取 0.5s > 轻链段间隔 0.4s，保证被击方至少一个完整的反击/脱身窗口；伤害不受影响。 */
export const FLINCH_IMMUNITY_DURATION = 0.5

/** 回退单阶段：无阶段信息时使用（行为与重构前一致） */
const FALLBACK_PHASE: AttackPhase = {
    name: 'strike', durationRatio: 1, moveSpeedMultiplier: 0.3, cancellable: false,
}

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
