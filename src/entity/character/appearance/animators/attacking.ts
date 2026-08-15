import type {AnimationHandler} from '../types.ts'
import type {AttackPhase, AttackPhaseName} from '../../../../character/combat/attack_phases.ts'
import {applyEasing, strikeCurve, DEFAULT_ANIM} from '../../../../character/combat/attack_phases.ts'
import {
    FALLBACK_WINDUP_END_RATIO,
    FALLBACK_STRIKE_END_RATIO,
    FALLBACK_ATTACK_DURATION,
    ATTACK_LEFT_ARM_COUNTER,
    ATTACK_LEFT_ELBOW_BEND,
    ATTACK_HEAD_TILT_WINDUP,
    ATTACK_HEAD_TILT_STRIKE,
    ATTACK_HEAD_BOB,
    ATTACK_HEAD_BOB_FREQ,
    ATTACK_HOLD_SWAY,
    ATTACK_HOLD_SWAY_FREQ,
    TWO_HAND_GRIP,
    WRIST_EDGE_YAW_FACTOR,
    HIP_Y,
    TWIST_WINDUP,
    TWIST_STRIKE,
    THRUST_LUNGE_DIST,
    THRUST_COIL,
    SPIN_COIL,
    SPIN_RESIDUAL,
    OVERSHOOT_SCALE,
    LUNGE_FRONT_HIP,
    LUNGE_FRONT_KNEE,
    LUNGE_BACK_HIP,
    LUNGE_BACK_KNEE,
    LUNGE_SINK,
    LUNGE_WINDUP,
    LUNGE_STRIKE,
    LUNGE_SPIN,
    LUNGE_RANGED_AIM,
    LUNGE_RANGED_RELEASE,
} from '../constants.ts'

/**
 * 阶段末姿态：
 * - shoulderX/Z 右肩摆角、elbowX 右肘、bodyLean 躯干前倾（spine.rotation.x）
 * - spineY 拧腰（横斩动力链）、spineZ 探身（刺击前移）、lunge 弓步量（0-1）
 */
interface PhasePose {
    readonly shoulderX: number
    readonly shoulderZ: number
    readonly elbowX: number
    readonly bodyLean: number
    readonly spineY: number
    readonly spineZ: number
    readonly lunge: number
}

const NEUTRAL_POSE: PhasePose = {shoulderX: 0, shoulderZ: 0, elbowX: 0, bodyLean: 0, spineY: 0, spineZ: 0, lunge: 0}

/** 左臂姿态：肩X（前后摆）/ 肩Y（内收）/ 肘X */
interface LeftPose {
    readonly x: number
    readonly y: number
    readonly elbow: number
}

const LEFT_NEUTRAL: LeftPose = {x: 0, y: 0, elbow: 0}
const LEFT_ENGAGED: LeftPose = {x: -ATTACK_LEFT_ARM_COUNTER, y: 0, elbow: ATTACK_LEFT_ELBOW_BEND}
const LEFT_RELEASE: LeftPose = {x: 0, y: 0, elbow: 0}

/** 腕部姿态：X 抵消静态握持前倾（武器与前臂共线的 guard 位）、Y 刃面偏转 */
interface WristPose {
    readonly x: number
    readonly y: number
}

const WRIST_NEUTRAL: WristPose = {x: 0, y: 0}

/**
 * 计算阶段末姿态 — 按阶段名语义解释 animConfig：
 * - windup/draw：蓄力末姿态（手臂后摆抬起 + 反向拧腰，Z 轴叠加武器专属偏置）
 * - aim/spin：维持蓄力姿态；spin 阶段 spine.y 转满一圈（旋转横扫本体）
 * - strike/release：随动末姿态（肘伸展、躯干前倾 + 顺向拧腰过正 / 刺击探身）
 * - recovery：归位末姿态（肩/腰归零，肘/前倾残留由配置决定）
 *
 * 仅挥砍类（attackType='slash'）受 swingTilt 随机分解影响；
 * 刺击/旋转动作轨迹固定，X 幅值直接生效。
 */
const phaseEndPose = (phase: AttackPhase, tilt: number): PhasePose => {
    const cfg = phase.animConfig
    const useTilt = cfg.attackType === 'slash'
    const cos = useTilt ? Math.cos(tilt) : 1
    const sin = useTilt ? Math.sin(tilt) : 0
    switch (phase.name) {
        case 'windup':
        case 'draw': {
            const coil = cfg.attackType === 'spin' ? -SPIN_COIL
                : cfg.attackType === 'thrust' ? -THRUST_COIL
                : -sin * TWIST_WINDUP
            return {
                /* 下垂手臂绕局部 X 轴：正=后摆、负=前摆；配置保留“负 backX=后收、正 forwardX=前挥”的直觉语义，此处翻转 */
                shoulderX: -cfg.armSwingBackX * cos,
                shoulderZ: cfg.armSwingBackZ + cfg.armSwingBackX * sin,
                elbowX: cfg.elbowBend,
                bodyLean: cfg.bodyLean,
                spineY: coil,
                spineZ: 0,
                lunge: LUNGE_WINDUP,
            }
        }
        case 'aim':
            return {
                shoulderX: -cfg.armSwingBackX * cos,
                shoulderZ: cfg.armSwingBackZ + cfg.armSwingBackX * sin,
                elbowX: cfg.elbowBend,
                bodyLean: cfg.bodyLean,
                spineY: 0,
                spineZ: 0,
                lunge: LUNGE_RANGED_AIM,
            }
        case 'spin':
            /* 旋转横扫：手臂维持水平持械位，躯干拧转一整圈（2π - 残余，视觉上归位） */
            return {
                shoulderX: -cfg.armSwingBackX,
                shoulderZ: cfg.armSwingBackZ,
                elbowX: cfg.elbowBend,
                bodyLean: cfg.bodyLean,
                spineY: Math.PI * 2 - SPIN_RESIDUAL,
                spineZ: 0,
                lunge: LUNGE_SPIN,
            }
        case 'strike':
        case 'release': {
            const isThrust = cfg.attackType === 'thrust'
            /* 拧腰过正：躯干先于手臂发力，打击末躯干顺向转过头 */
            const unwind = cfg.attackType === 'spin' ? 0
                : isThrust ? THRUST_COIL
                : sin * TWIST_STRIKE
            return {
                shoulderX: -cfg.armSwingForwardX * cos,
                shoulderZ: cfg.armSwingForwardX * sin,
                elbowX: cfg.elbowBend,
                bodyLean: cfg.bodyLean,
                spineY: unwind,
                spineZ: isThrust ? THRUST_LUNGE_DIST : 0,
                lunge: cfg.attackType === 'slash' || isThrust ? LUNGE_STRIKE : LUNGE_RANGED_RELEASE,
            }
        }
        case 'recovery':
            return {
                shoulderX: 0,
                shoulderZ: 0,
                elbowX: cfg.elbowBend,
                bodyLean: cfg.bodyLean,
                spineY: 0,
                spineZ: 0,
                lunge: 0,
            }
    }
}

/** 阶段末左臂姿态：双手武器进扶柄位，单手武器平衡反摆（恢复阶段归零） */
const leftSettled = (phase: AttackPhase): LeftPose => {
    if (phase.animConfig.twoHanded) return TWO_HAND_GRIP
    return phase.name === 'recovery' ? LEFT_RELEASE : LEFT_ENGAGED
}

/** 阶段末腕部姿态：非恢复阶段对齐武器至前臂共线，挥砍类按倾斜角偏转刃面 */
const wristSettled = (phase: AttackPhase, tilt: number, gripTilt: number): WristPose => {
    if (phase.name === 'recovery') return WRIST_NEUTRAL
    return {
        x: -gripTilt,
        y: phase.animConfig.attackType === 'slash' ? tilt * WRIST_EDGE_YAW_FACTOR : 0,
    }
}

/** 无阶段信息回退用的虚拟三阶段（DEFAULT_ANIM 组合，保持阶段化之前的视觉基线） */
const FALLBACK_PHASES: readonly AttackPhase[] = [
    {name: 'windup', durationRatio: FALLBACK_WINDUP_END_RATIO, moveSpeedMultiplier: 1, cancellable: false, animConfig: DEFAULT_ANIM},
    {name: 'strike', durationRatio: FALLBACK_STRIKE_END_RATIO - FALLBACK_WINDUP_END_RATIO, moveSpeedMultiplier: 1, cancellable: false, animConfig: DEFAULT_ANIM},
    {name: 'recovery', durationRatio: 1 - FALLBACK_STRIKE_END_RATIO, moveSpeedMultiplier: 1, cancellable: false, animConfig: DEFAULT_ANIM},
]

/** 阶段跨度：当前阶段 + 归一化进度 + 上一阶段（用于姿态链式衔接） */
interface PhaseSpan {
    readonly phase: AttackPhase
    readonly p: number
    readonly prevPhase: AttackPhase | undefined
}

/** 回退路径：把总进度映射为虚拟阶段跨度 */
const mapFallbackProgress = (tNorm: number): PhaseSpan => {
    const clamped = Math.min(Math.max(tNorm, 0), 1)
    const [windup, strike, recovery] = FALLBACK_PHASES
    if (clamped < FALLBACK_WINDUP_END_RATIO) {
        return {phase: windup, p: clamped / FALLBACK_WINDUP_END_RATIO, prevPhase: undefined}
    }
    if (clamped < FALLBACK_STRIKE_END_RATIO) {
        return {
            phase: strike,
            p: (clamped - FALLBACK_WINDUP_END_RATIO) / (FALLBACK_STRIKE_END_RATIO - FALLBACK_WINDUP_END_RATIO),
            prevPhase: windup,
        }
    }
    return {
        phase: recovery,
        p: Math.min((clamped - FALLBACK_STRIKE_END_RATIO) / (1 - FALLBACK_STRIKE_END_RATIO), 1),
        prevPhase: strike,
    }
}

/** 头部侧偏：蓄力向一侧、打击回摆、恢复归零 */
const headTilt = (name: AttackPhaseName, e: number): number => {
    switch (name) {
        case 'windup':
        case 'draw':
        case 'aim':
        case 'spin':
            return -ATTACK_HEAD_TILT_WINDUP * e
        case 'recovery':
            return ATTACK_HEAD_TILT_STRIKE * (1 - e)
        default:
            return ATTACK_HEAD_TILT_STRIKE * e
    }
}

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t

export const attackingAnim: AnimationHandler = {
    enter: (model, _ctx) => {
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.rightArmElbow.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
        model.leftArmElbow.rotation.set(0, 0, 0)
        model.rightWristPivot.rotation.set(0, 0, 0)
        model.headNeck.rotation.set(0, 0, 0)
        model.spine.rotation.set(0, 0, 0)
        model.spine.position.set(0, HIP_Y, 0)
    },
    update: (_dt, model, ctx) => {
        void _dt
        const tilt = ctx.swingTilt

        let span: PhaseSpan
        const phases = ctx.attackPhases
        if (phases !== undefined && phases.length > 0 && ctx.attackPhaseIndex >= 0) {
            if (ctx.attackPhaseIndex < phases.length) {
                span = {
                    phase: phases[ctx.attackPhaseIndex],
                    p: Math.min(Math.max(ctx.attackPhaseProgress, 0), 1),
                    prevPhase: ctx.attackPhaseIndex > 0 ? phases[ctx.attackPhaseIndex - 1] : undefined,
                }
            } else {
                /* 全部阶段完成：维持最终姿态直至状态退出 */
                span = {phase: phases[phases.length - 1], p: 1, prevPhase: phases.length > 1 ? phases[phases.length - 2] : undefined}
            }
        } else {
            /* 回退：无阶段信息时按总进度驱动（兼容无阶段数据场景） */
            const tNorm = ctx.attackTotalProgress > 0
                ? ctx.attackTotalProgress
                : ctx.stateTime / FALLBACK_ATTACK_DURATION
            span = mapFallbackProgress(tNorm)
        }

        const {phase, prevPhase} = span
        /* 打击/释放阶段用"末端加速"打击曲线（速度峰值在 strikePeakRatio），其余阶段按配置缓动 */
        const isStrike = phase.name === 'strike' || phase.name === 'release'
        const e = isStrike
            ? strikeCurve(span.p, phase.animConfig.strikePeakRatio)
            : applyEasing(span.p, phase.animConfig.easing)

        /* 持械臂：上一阶段末姿态 → 本阶段末姿态链式插值 */
        let startPose = prevPhase !== undefined ? phaseEndPose(prevPhase, tilt) : NEUTRAL_POSE
        const endPose = phaseEndPose(phase, tilt)

        /* 恢复阶段起点叠加惯性过冲：动量把摆臂推过随动点再收回 */
        if (phase.name === 'recovery' && prevPhase !== undefined) {
            const over = 1 + prevPhase.animConfig.overshootRatio * OVERSHOOT_SCALE
            startPose = {
                ...startPose,
                shoulderX: startPose.shoulderX * over,
                shoulderZ: startPose.shoulderZ * over,
            }
        }

        /* 瞄准/旋转维持阶段叠加微颤，避免持械臂完全静止 */
        const isHold = phase.name === 'aim' || phase.name === 'spin'
        const sway = isHold ? Math.sin(ctx.stateTime * ATTACK_HOLD_SWAY_FREQ) * ATTACK_HOLD_SWAY : 0

        model.rightArmShoulder.rotation.x = lerp(startPose.shoulderX, endPose.shoulderX, e)
        model.rightArmShoulder.rotation.z = lerp(startPose.shoulderZ, endPose.shoulderZ, e) + sway
        model.rightArmElbow.rotation.x = lerp(startPose.elbowX, endPose.elbowX, e)

        /* 动力链躯干：前倾 + 拧腰 + 刺击探身 */
        model.spine.rotation.x = lerp(startPose.bodyLean, endPose.bodyLean, e)
        model.spine.rotation.y = lerp(startPose.spineY, endPose.spineY, e)
        const spineZ = lerp(startPose.spineZ, endPose.spineZ, e)

        /* 弓步：前腿迈出 + 后腿蹬伸 + 重心下沉（腿角随 lunge 量链式插值） */
        const lunge = lerp(startPose.lunge, endPose.lunge, e)
        model.rightLegHip.rotation.x = -LUNGE_FRONT_HIP * lunge
        model.leftLegHip.rotation.x = LUNGE_BACK_HIP * lunge
        model.rightLegKnee.rotation.x = LUNGE_FRONT_KNEE * lunge
        model.leftLegKnee.rotation.x = LUNGE_BACK_KNEE * lunge
        model.spine.position.set(0, HIP_Y - LUNGE_SINK * lunge, spineZ)

        /* 腕部：对齐武器至前臂共线 + 挥砍刃面偏转（横斩刃面转水平） */
        const startWrist = prevPhase !== undefined ? wristSettled(prevPhase, tilt, model.weaponGripTilt) : WRIST_NEUTRAL
        const endWrist = wristSettled(phase, tilt, model.weaponGripTilt)
        model.rightWristPivot.rotation.x = lerp(startWrist.x, endWrist.x, e)
        model.rightWristPivot.rotation.y = lerp(startWrist.y, endWrist.y, e)

        /* 左臂：双手武器扶柄 / 单手武器平衡反摆 */
        const startLeft = prevPhase !== undefined ? leftSettled(prevPhase) : LEFT_NEUTRAL
        const endLeft = leftSettled(phase)
        model.leftArmShoulder.rotation.x = lerp(startLeft.x, endLeft.x, e)
        model.leftArmShoulder.rotation.y = lerp(startLeft.y, endLeft.y, e)
        model.leftArmElbow.rotation.x = lerp(startLeft.elbow, endLeft.elbow, e)

        model.headNeck.rotation.z = headTilt(phase.name, e)
        model.headNeck.rotation.x = Math.sin(ctx.stateTime * ATTACK_HEAD_BOB_FREQ) * ATTACK_HEAD_BOB
    },
    exit: (model) => {
        model.rightArmShoulder.rotation.set(0, 0, 0)
        model.rightArmElbow.rotation.set(0, 0, 0)
        model.leftArmShoulder.rotation.set(0, 0, 0)
        model.leftArmElbow.rotation.set(0, 0, 0)
        model.rightWristPivot.rotation.set(0, 0, 0)
        model.headNeck.rotation.set(0, 0, 0)
        model.spine.rotation.set(0, 0, 0)
        model.spine.position.set(0, HIP_Y, 0)
    },
}
