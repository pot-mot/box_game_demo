import type {AttackSegment} from '../../../../character/weapon/attack_chain.ts'
import {phaseDurationOf, resolvePhases} from '../../../../character/combat/attack_phases.ts'
import {clamp01} from './gait.ts'

/** 攻击段总进度（0–1），按段总时长归一化；避免各姿态函数写死 0.4 / 0.5 秒 */
export const segmentProgress = (t: number, segment: AttackSegment): number => {
    const total = segment.duration + segment.recovery
    return total <= 0 ? 1 : clamp01(t / total)
}

/** 攻击动作段结束比例（不含恢复段） */
export const actionProgress = (segment: AttackSegment): number => {
    const total = segment.duration + segment.recovery
    return total <= 0 ? 1 : clamp01(segment.duration / total)
}

/** 段内阶段分界（整段归一化比例）：抬手末 = 打击开始，打击末 = 动作结束 */
export interface SegmentPhaseRatios {
    readonly windupEnd: number
    readonly strikeEnd: number
    readonly actionEnd: number
}

/** 从阶段配置解析抬手末 / 打击末；不再由各体形写死 0.62 / 0.65 / 0.72 */
export const segmentPhaseRatios = (segment: AttackSegment): SegmentPhaseRatios => {
    const phases = resolvePhases(segment.phases)
    const total = Math.max(0.0001, segment.duration + segment.recovery)
    let elapsed = 0
    let windupEnd: number | undefined
    let strikeEnd: number | undefined
    for (const phase of phases) {
        const duration = phaseDurationOf(phase, segment.duration, segment.recovery)
        if (phase.name === 'windup' || phase.name === 'draw' || phase.name === 'aim') {
            elapsed += duration
            windupEnd = elapsed / total
            continue
        }
        if (phase.name === 'strike' || phase.name === 'release' || phase.name === 'spin') {
            if (windupEnd === undefined) windupEnd = elapsed / total
            elapsed += duration
            strikeEnd = elapsed / total
            continue
        }
        elapsed += duration
    }
    return {
        windupEnd: clamp01(windupEnd ?? 0),
        strikeEnd: clamp01(strikeEnd ?? actionProgress(segment)),
        actionEnd: actionProgress(segment),
    }
}

/** 抬手结束 / 挥击结束在整段中的比例：用于生成 hitbox_on/off 事件轨 */
export const hitWindowRatios = (segment: AttackSegment): {on: number; off: number} => {
    const ratios = segmentPhaseRatios(segment)
    return {on: ratios.windupEnd, off: ratios.strikeEnd}
}

/** 攻击段内三段进度（0–1，原始未缓动）：抬手 / 打击 / 恢复 */
export interface AttackPhaseProgress {
    readonly progress: number
    readonly windup: number
    readonly strike: number
    readonly recovery: number
}

/** 按真实阶段分界采样攻击段：抬手结束进入打击，打击结束进入恢复 */
export const attackPhaseProgress = (t: number, segment: AttackSegment): AttackPhaseProgress => {
    const progress = segmentProgress(t, segment)
    const {windupEnd, strikeEnd} = segmentPhaseRatios(segment)
    if (progress <= windupEnd) {
        return {
            progress,
            windup: windupEnd <= 0 ? 1 : clamp01(progress / windupEnd),
            strike: 0,
            recovery: 0,
        }
    }
    if (progress <= strikeEnd) {
        return {
            progress,
            windup: 1,
            strike: clamp01((progress - windupEnd) / Math.max(strikeEnd - windupEnd, 0.0001)),
            recovery: 0,
        }
    }
    return {
        progress,
        windup: 1,
        strike: 1,
        recovery: clamp01((progress - strikeEnd) / Math.max(1 - strikeEnd, 0.0001)),
    }
}
