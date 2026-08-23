import {Euler, Quaternion, Vector3} from 'three'
import type {BoneAnimationClip} from '../../../../skeleton/anim/types.ts'
import type {AttackPhase, AttackPhaseName} from '../../../../character/combat/attack_phases.ts'
import {applyEasing, strikeCurve, DEFAULT_ANIM, phaseDurationOf} from '../../../../character/combat/attack_phases.ts'
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
import {CHARACTER_JOINT_IDS, CHARACTER_JOINT_REST_POSITIONS, type CharacterJointId} from './base_clips.ts'
import type {PoseState} from '../pose_fns.ts'

/** 阶段末姿态（公式与旧 attacking.ts 完全一致） */
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

interface LeftPose {
    readonly x: number
    readonly y: number
    readonly elbow: number
}

const LEFT_NEUTRAL: LeftPose = {x: 0, y: 0, elbow: 0}
const LEFT_ENGAGED: LeftPose = {x: -ATTACK_LEFT_ARM_COUNTER, y: 0, elbow: ATTACK_LEFT_ELBOW_BEND}
const LEFT_RELEASE: LeftPose = {x: 0, y: 0, elbow: 0}

interface WristPose {
    readonly x: number
    readonly y: number
}

const WRIST_NEUTRAL: WristPose = {x: 0, y: 0}

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

const leftSettled = (phase: AttackPhase): LeftPose => {
    if (phase.animConfig.twoHanded) return TWO_HAND_GRIP
    return phase.name === 'recovery' ? LEFT_RELEASE : LEFT_ENGAGED
}

const wristSettled = (phase: AttackPhase, tilt: number, gripTilt: number): WristPose => {
    if (phase.name === 'recovery') return WRIST_NEUTRAL
    return {
        x: -gripTilt,
        y: phase.animConfig.attackType === 'slash' ? tilt * WRIST_EDGE_YAW_FACTOR : 0,
    }
}

const FALLBACK_PHASES: readonly AttackPhase[] = [
    {name: 'windup', durationRatio: FALLBACK_WINDUP_END_RATIO, moveSpeedMultiplier: 1, cancellable: false, animConfig: DEFAULT_ANIM},
    {name: 'strike', durationRatio: FALLBACK_STRIKE_END_RATIO - FALLBACK_WINDUP_END_RATIO, moveSpeedMultiplier: 1, cancellable: false, animConfig: DEFAULT_ANIM},
    {name: 'recovery', durationRatio: 1 - FALLBACK_STRIKE_END_RATIO, moveSpeedMultiplier: 1, cancellable: false, animConfig: DEFAULT_ANIM},
]

interface PhaseSpan {
    readonly phase: AttackPhase
    readonly p: number
    readonly prevPhase: AttackPhase | undefined
}

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

/** t（clip 时间）→ 阶段跨度：按阶段时长累加定位，全部完成后维持末阶段 p=1 */
const spanAt = (t: number, phases: readonly AttackPhase[], duration: number, recovery: number): PhaseSpan => {
    let acc = 0
    for (let i = 0; i < phases.length; i++) {
        const d = phaseDurationOf(phases[i], duration, recovery)
        if (t < acc + d) {
            return {phase: phases[i], p: (t - acc) / d, prevPhase: i > 0 ? phases[i - 1] : undefined}
        }
        acc += d
    }
    const last = phases[phases.length - 1]
    return {phase: last, p: 1, prevPhase: phases.length > 1 ? phases[phases.length - 2] : undefined}
}

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

/** 攻击姿态采样（公式与旧 attacking.ts 逐行一致；stateTime 由 clip 时间 t 提供） */
const attackPoseAt = (
    t: number,
    phases: readonly AttackPhase[],
    duration: number,
    recovery: number,
    tilt: number,
    gripTilt: number,
): PoseState => {
    const total = phases.length > 0 ? duration + recovery : FALLBACK_ATTACK_DURATION
    const span = phases.length > 0
        ? spanAt(t, phases, duration, recovery)
        : mapFallbackProgress(t / total)
    const {phase, prevPhase} = span
    const isStrike = phase.name === 'strike' || phase.name === 'release'
    const e = isStrike
        ? strikeCurve(span.p, phase.animConfig.strikePeakRatio)
        : applyEasing(span.p, phase.animConfig.easing)

    let startPose = prevPhase !== undefined ? phaseEndPose(prevPhase, tilt) : NEUTRAL_POSE
    const endPose = phaseEndPose(phase, tilt)

    if (phase.name === 'recovery' && prevPhase !== undefined) {
        const over = 1 + prevPhase.animConfig.overshootRatio * OVERSHOOT_SCALE
        startPose = {
            ...startPose,
            shoulderX: startPose.shoulderX * over,
            shoulderZ: startPose.shoulderZ * over,
        }
    }

    const isHold = phase.name === 'aim' || phase.name === 'spin'
    const sway = isHold ? Math.sin(t * ATTACK_HOLD_SWAY_FREQ) * ATTACK_HOLD_SWAY : 0

    const shoulderX = lerp(startPose.shoulderX, endPose.shoulderX, e)
    const shoulderZ = lerp(startPose.shoulderZ, endPose.shoulderZ, e) + sway
    const elbowX = lerp(startPose.elbowX, endPose.elbowX, e)
    const bodyLean = lerp(startPose.bodyLean, endPose.bodyLean, e)
    const spineY = lerp(startPose.spineY, endPose.spineY, e)
    const spineZ = lerp(startPose.spineZ, endPose.spineZ, e)
    const lunge = lerp(startPose.lunge, endPose.lunge, e)

    const startWrist = prevPhase !== undefined ? wristSettled(prevPhase, tilt, gripTilt) : WRIST_NEUTRAL
    const endWrist = wristSettled(phase, tilt, gripTilt)

    const startLeft = prevPhase !== undefined ? leftSettled(prevPhase) : LEFT_NEUTRAL
    const endLeft = leftSettled(phase)

    const zero = {rx: 0, ry: 0, rz: 0}

    return {
        rightArmShoulder: {rx: shoulderX, ry: 0, rz: shoulderZ},
        rightArmElbow: {rx: elbowX, ry: 0, rz: 0},
        rightWristPivot: {rx: lerp(startWrist.x, endWrist.x, e), ry: lerp(startWrist.y, endWrist.y, e), rz: 0},
        leftArmShoulder: {rx: lerp(startLeft.x, endLeft.x, e), ry: lerp(startLeft.y, endLeft.y, e), rz: 0},
        leftArmElbow: {rx: lerp(startLeft.elbow, endLeft.elbow, e), ry: 0, rz: 0},
        rightLegHip: {rx: -LUNGE_FRONT_HIP * lunge, ry: 0, rz: 0},
        rightLegKnee: {rx: LUNGE_FRONT_KNEE * lunge, ry: 0, rz: 0},
        leftLegHip: {rx: LUNGE_BACK_HIP * lunge, ry: 0, rz: 0},
        leftLegKnee: {rx: LUNGE_BACK_KNEE * lunge, ry: 0, rz: 0},
        headNeck: {rx: Math.sin(t * ATTACK_HEAD_BOB_FREQ) * ATTACK_HEAD_BOB, ry: 0, rz: headTilt(phase.name, e)},
        spine: {rotation: {rx: bodyLean, ry: spineY, rz: 0}, position: [0, HIP_Y - LUNGE_SINK * lunge, spineZ]},
        group: {rotation: zero},
    }
}

/** 攻击 clip 生成参数（技能配置静态值 + 段固有 tilt + 武器握持前倾） */
export interface AttackClipParams {
    readonly skillId: string
    readonly duration: number
    readonly recovery: number
    /** undefined = 无阶段信息回退（虚拟三阶段） */
    readonly phases: readonly AttackPhase[] | undefined
    readonly tilt: number
    readonly gripTilt: number
}

const SAMPLE_FPS = 60

/** 攻击 clip 总时长：有阶段 = duration + recovery；无阶段 = 回退时长 */
export const attackClipDurationOf = (params: AttackClipParams): number =>
    params.phases !== undefined && params.phases.length > 0
        ? params.duration + params.recovery
        : FALLBACK_ATTACK_DURATION

/** 构建攻击 clip：姿态按 60fps 烘焙阶段公式；近战事件轨驱动命中窗口（0.1~0.85 动作进度，与旧 executor 窗口一致） */
export const buildAttackClip = (params: AttackClipParams): BoneAnimationClip => {
    const total = attackClipDurationOf(params)
    const phases = params.phases !== undefined && params.phases.length > 0 ? params.phases : FALLBACK_PHASES
    const frameCount = Math.max(2, Math.round(total * SAMPLE_FPS) + 1)

    const tracks = CHARACTER_JOINT_IDS.map(jointId => {
        const records: {time: number; position: Vector3; rotation: Quaternion}[] = []
        for (let i = 0; i < frameCount; i++) {
            const t = total * i / (frameCount - 1)
            const pose = attackPoseAt(t, phases, params.duration, params.recovery, params.tilt, params.gripTilt)
            const record = attackPoseToRecord(pose).get(jointId)!
            records.push({time: t, position: record.position, rotation: record.rotation})
        }
        return {
            targetId: jointId,
            interpolation: {type: 'bezier_quad', strategy: 'none'} as const,
            records,
        }
    })

    /* 近战命中窗口事件（仅 melee 有效：ranged 无 weaponHitBox，事件轨置空由调用方按需裁剪） */
    const meleeEvents = [
        {time: params.duration * 0.1, eventName: 'hitbox_on'},
        {time: Math.min(params.duration * 0.85, total), eventName: 'hitbox_off'},
    ]

    return {
        name: params.skillId,
        duration: total,
        loop: false,
        jointTracks: tracks,
        boneTracks: [],
        eventTracks: [{records: meleeEvents}],
    }
}

const attackPoseToRecord = (pose: PoseState): ReadonlyMap<CharacterJointId, {position: Vector3; rotation: Quaternion}> => {
    const map = new Map<CharacterJointId, {position: Vector3; rotation: Quaternion}>()
    const joints: Record<CharacterJointId, {rx: number; ry: number; rz: number}> = {
        rightArmShoulder: pose.rightArmShoulder,
        rightArmElbow: pose.rightArmElbow,
        rightWristPivot: pose.rightWristPivot,
        leftArmShoulder: pose.leftArmShoulder,
        leftArmElbow: pose.leftArmElbow,
        rightLegHip: pose.rightLegHip,
        rightLegKnee: pose.rightLegKnee,
        leftLegHip: pose.leftLegHip,
        leftLegKnee: pose.leftLegKnee,
        headNeck: pose.headNeck,
        spine: pose.spine.rotation,
        group: pose.group.rotation,
    }
    for (const jointId of CHARACTER_JOINT_IDS) {
        const e = joints[jointId]
        const position = jointId === 'spine'
            ? new Vector3().fromArray([...pose.spine.position])
            : new Vector3().fromArray([...CHARACTER_JOINT_REST_POSITIONS[jointId]])
        map.set(jointId, {
            position,
            rotation: new Quaternion().setFromEuler(new Euler(e.rx, e.ry, e.rz)),
        })
    }
    return map
}

/** 攻击 clip 缓存（key = skillId + gripTilt + duration/recovery；tilt 内置于技能配置） */
const attackClipCache = new Map<string, BoneAnimationClip>()

export const getAttackClip = (params: AttackClipParams): BoneAnimationClip => {
    const key = `${params.skillId}:${params.gripTilt}:${params.duration}:${params.recovery}`
    const cached = attackClipCache.get(key)
    if (cached !== undefined) return cached
    const clip = buildAttackClip(params)
    attackClipCache.set(key, clip)
    return clip
}