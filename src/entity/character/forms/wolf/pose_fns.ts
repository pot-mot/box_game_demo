import type {AttackSegment} from '../../../../character/weapon/attack_chain.ts'
import type {CharacterState} from '../../../../character/state_machine/types.ts'
import {attackPhaseProgress} from '../creature_runtime/timing.ts'
import {poseAt, type JointEulers, type PoseFunction} from '../creature_runtime/pose.ts'
import {breath, clamp01, easeInCubic, easeInOutCubic, easeOutCubic, footSwing, phaseOffset, smoothstep, TAU} from '../creature_runtime/gait.ts'

/**
 * 狼姿态函数（四足）：对角小跑 + 躯干起伏 + 颈头反向稳定 + 三节尾跟随。
 * 攻击按段 id 区分撕咬 / 口含剑，不再按 key 共用姿态。
 */

const BODY_Y = 0.45
const BODY_Z = 0.05

type LegKey = readonly [hip: string, knee: string, foot: string]

const LEGS: Record<'fl' | 'fr' | 'rl' | 'rr', LegKey> = {
    fl: ['flHip', 'flKnee', 'flFoot'],
    fr: ['frHip', 'frKnee', 'frFoot'],
    rl: ['rlHip', 'rlKnee', 'rlFoot'],
    rr: ['rrHip', 'rrKnee', 'rrFoot'],
}

const putLeg = (
    out: Record<string, readonly [number, number, number]>,
    leg: LegKey,
    hip: number,
    knee: number,
    foot: number,
): void => {
    out[leg[0]] = [hip, 0, 0]
    out[leg[1]] = [knee, 0, 0]
    out[leg[2]] = [foot, 0, 0]
}

/** 四腿同姿态（静立 / 收腿等） */
const allLegs = (hip: number, knee: number, foot: number): JointEulers => {
    const out: Record<string, readonly [number, number, number]> = {}
    for (const leg of Object.values(LEGS)) putLeg(out, leg, hip, knee, foot)
    return out
}

/** 对角小跑步态：fl/rr 同相，fr/rl 反相；支撑相脚掌向后推、摆动相抬脚向前 */
const trotPose = (phase: number, amplitude: number, liftScale = 1): JointEulers => {
    const out: Record<string, readonly [number, number, number]> = {}
    const stride = (key: keyof typeof LEGS, offset: number): void => {
        const foot = footSwing(phaseOffset(phase, offset), 0.58)
        const hip = -foot.forward * amplitude
        const push = Math.max(0, -foot.forward)
        const knee = foot.lift * 0.9 * liftScale + push * 0.18
        const ankle = -foot.lift * 0.5 * liftScale + Math.max(0, foot.forward) * 0.1
        putLeg(out, LEGS[key], hip, knee, ankle)
    }
    stride('fl', 0)
    stride('rr', 0)
    stride('fr', 0.5)
    stride('rl', 0.5)
    return out
}

const tailPose = (t: number, speed: number, amplitude: number, yawBias = 0): JointEulers => ({
    tailA: [0.02 + Math.sin(t * speed * 0.5) * amplitude * 0.5, yawBias + Math.sin(t * speed) * amplitude, Math.sin(t * speed * 0.8) * amplitude * 0.3],
    tailB: [0.01 + Math.sin(t * speed * 0.5 - 0.55) * amplitude * 0.7, yawBias * 1.2 + Math.sin(t * speed - 0.45) * amplitude * 1.25, Math.sin(t * speed * 0.8 - 0.4) * amplitude * 0.45],
    tailC: [Math.sin(t * speed * 0.5 - 1.0) * amplitude * 0.8, yawBias * 1.4 + Math.sin(t * speed - 0.9) * amplitude * 1.5, Math.sin(t * speed * 0.8 - 0.8) * amplitude * 0.6],
})

const earPose = (t: number, flatten = 0): JointEulers => {
    const twitch = Math.max(0, Math.sin(t * 2.3) - 0.92) * 0.7
    return {
        earL: [flatten, 0, 0.12 + twitch],
        earR: [flatten * 0.9, 0, -0.12 - twitch * 0.7],
    }
}

const idle: PoseFunction = (t) => {
    const breathe = breath(t, 1.8)
    const shift = Math.sin(t * 0.65)
    return {
        body: poseAt(
            [Math.sin(t * 1.6) * 0.012 + shift * 0.008, Math.sin(t * 0.6) * 0.015, Math.sin(t * 1.1) * 0.008],
            [shift * 0.008, BODY_Y + breathe * 0.012, BODY_Z],
        ),
        neck: [0.08 + Math.sin(t * 1.5) * 0.03, Math.sin(t * 0.35) * 0.16, 0],
        head: [-0.07 - Math.sin(t * 1.5 + 0.4) * 0.02, Math.sin(t * 0.35 + 0.2) * 0.2, Math.sin(t * 0.7) * 0.025],
        jaw: [Math.max(0, Math.sin(t * 0.7) - 0.85) * 0.18, 0, 0],
        ...tailPose(t, 1.35, 0.13),
        ...earPose(t),
        ...allLegs(0, 0.045, -0.02),
        flHip: [0.02 + shift * 0.02, 0, 0],
        frHip: [0.02 - shift * 0.02, 0, 0],
    }
}

const walking: PoseFunction = (t) => {
    const phase = (t % 0.7) / 0.7
    const bob = Math.sin(phase * TAU * 2) * 0.02
    const roll = Math.sin(phase * TAU) * 0.028
    return {
        body: poseAt(
            [0.018 + Math.sin(phase * TAU * 2 + 0.45) * 0.014, Math.sin(phase * TAU) * 0.024, roll],
            [Math.sin(phase * TAU) * 0.008, BODY_Y + bob, BODY_Z],
        ),
        neck: [0.075 - bob * 0.65, Math.sin(phase * TAU + 0.3) * 0.035, -roll * 0.4],
        head: [-0.06 + bob * 0.35, -Math.sin(phase * TAU + 0.3) * 0.05, -roll * 0.6],
        ...trotPose(phase, 0.56),
        ...tailPose(t, 2.4, 0.14, -Math.sin(phase * TAU) * 0.07),
        ...earPose(t),
    }
}

const jumping: PoseFunction = (t) => {
    const k = clamp01(t / 0.35)
    return {
        body: poseAt([-0.22 + k * 0.12, 0, 0], [0, BODY_Y + 0.02 + k * 0.02, BODY_Z]),
        neck: [0.17 - k * 0.04, 0, 0],
        head: [-0.13, 0, 0],
        ...tailPose(t, 1.4, 0.18, 0.06),
        flHip: [-0.34 - k * 0.12, 0, 0], flKnee: [0.24 + k * 0.18, 0, 0], flFoot: [0.12, 0, 0],
        frHip: [-0.34 - k * 0.12, 0, 0], frKnee: [0.24 + k * 0.18, 0, 0], frFoot: [0.12, 0, 0],
        rlHip: [0.5 + k * 0.12, 0, 0], rlKnee: [0.6 + k * 0.15, 0, 0], rlFoot: [0.16, 0, 0],
        rrHip: [0.5 + k * 0.12, 0, 0], rrKnee: [0.6 + k * 0.15, 0, 0], rrFoot: [0.16, 0, 0],
    }
}

const falling: PoseFunction = (t) => ({
    body: poseAt([0.13, 0, 0], [0, BODY_Y - 0.005, BODY_Z]),
    neck: [0.05, 0, 0],
    head: [-0.05, 0, 0],
    ...tailPose(t, 2.8, 0.16, 0.08),
    flHip: [-0.55, 0, 0], flKnee: [0.35, 0, 0], flFoot: [0.2, 0, 0],
    frHip: [-0.55, 0, 0], frKnee: [0.35, 0, 0], frFoot: [0.2, 0, 0],
    rlHip: [0.24, 0, 0], rlKnee: [0.8, 0, 0], rlFoot: [0.2, 0, 0],
    rrHip: [0.24, 0, 0], rrKnee: [0.8, 0, 0], rrFoot: [0.2, 0, 0],
})

const swimming: PoseFunction = (t) => {
    const phase = (t % 0.9) / 0.9
    return {
        body: poseAt([0.16, Math.sin(phase * TAU) * 0.02, 0], [0, BODY_Y + Math.sin(phase * TAU * 2) * 0.008, BODY_Z]),
        neck: [0.04, Math.sin(phase * TAU + 0.3) * 0.04, 0],
        head: [-0.08, -Math.sin(phase * TAU + 0.3) * 0.05, 0],
        ...trotPose(phase, 0.6, 1.15),
        ...tailPose(t, 3.4, 0.18, Math.sin(phase * TAU) * 0.08),
    }
}

const floating: PoseFunction = (t) => {
    const paddle = Math.sin(t * 3.2)
    return {
        body: poseAt([0.34, 0, 0], [0, BODY_Y, BODY_Z]),
        neck: [0.18, 0, 0],
        head: [-0.14, Math.sin(t * 0.8) * 0.06, 0],
        ...tailPose(t, 2.0, 0.14),
        flHip: [-0.35 + paddle * 0.18, 0, 0], flKnee: [0.5 - paddle * 0.15, 0, 0], flFoot: [0.12, 0, 0],
        frHip: [-0.35 - paddle * 0.18, 0, 0], frKnee: [0.5 + paddle * 0.15, 0, 0], frFoot: [0.12, 0, 0],
        rlHip: [0.42, 0, 0], rlKnee: [0.38, 0, 0], rlFoot: [0.05, 0, 0],
        rrHip: [0.42, 0, 0], rrKnee: [0.38, 0, 0], rrFoot: [0.05, 0, 0],
    }
}

const dying: PoseFunction = () => ({
    body: poseAt([0.52, 0, 0.28], [0, BODY_Y - 0.12, BODY_Z]),
    neck: [0.42, 0, 0.18],
    head: [0.24, 0, 0],
    ...tailPose(0.8, 1, 0.08),
    ...allLegs(0.35, 0.8, 0.15),
})

const rolling: PoseFunction = (t) => {
    const k = clamp01(t / 0.5)
    return {
        body: poseAt([0.35 + k * 0.3, 0, 0.25 * k], [0, BODY_Y - 0.1 * k, BODY_Z]),
        neck: [0.6, 0, 0.1],
        head: [0.25, 0, 0],
        ...tailPose(t, 4, 0.1),
        ...allLegs(0.85, 0.95, 0.3),
    }
}

const flinching: PoseFunction = (t) => ({
    body: poseAt([-0.22, 0.04, -0.05], [0, BODY_Y, BODY_Z]),
    neck: [-0.28, 0, 0.12],
    head: [0.2, -0.15, 0],
    ...tailPose(t, 5, 0.06),
    ...earPose(t, 0.45),
    ...allLegs(-0.15, 0.28, 0),
})

const knockdown: PoseFunction = () => ({
    body: poseAt([0.66, 0, 0.36], [0, BODY_Y - 0.18, BODY_Z]),
    neck: [0.48, 0, 0.16],
    head: [0.2, 0, 0],
    ...allLegs(0.42, 0.85, 0.2),
})

const gettingUp: PoseFunction = (t) => {
    const k = smoothstep(t / 0.5)
    return {
        body: poseAt([0.66 * (1 - k), 0, 0.36 * (1 - k)], [0, BODY_Y - 0.18 * (1 - k), BODY_Z]),
        neck: [0.48 * (1 - k), 0, 0.16 * (1 - k)],
        head: [0.2 * (1 - k), 0, 0],
        ...tailPose(t, 2, 0.08 * (1 - k)),
        ...allLegs(0.42 * (1 - k), 0.85 * (1 - k), 0.2 * (1 - k)),
    }
}

/** 状态 → 姿态函数（未列出的状态回退 idle） */
const POSES: Partial<Record<CharacterState, PoseFunction>> = {
    walking, jumping, falling, swimming, floating, dying, rolling, flinching, knockdown, getting_up: gettingUp,
}

export const wolfPose = (state: CharacterState): PoseFunction => POSES[state] ?? idle

const bitePose = (segment: AttackSegment, t: number): JointEulers => {
    const phase = attackPhaseProgress(t, segment)
    const heavy = segment.step === 1 && segment.key === 'heavy'
    const windup = easeOutCubic(phase.windup)
    const strike = easeInCubic(phase.strike)
    const recover = smoothstep(phase.recovery)
    const open = Math.max(0, windup * (heavy ? 1.05 : 0.72) * (1 - strike * 1.35))
    if (segment.key === 'air') {
        const thrust = strike * (1 - recover)
        return {
            body: poseAt([-0.22 + windup * 0.08 + thrust * 0.45, 0, 0], [0, BODY_Y + thrust * 0.03, BODY_Z + thrust * 0.12]),
            neck: [0.16 + windup * 0.12 + thrust * 0.55, 0, 0],
            head: [0.06 - windup * 0.05 - thrust * 0.35, 0, 0],
            jaw: [Math.max(0, open), 0, 0],
            ...tailPose(t, 3.4, 0.18, 0.08),
            ...allLegs(0.45, 0.75, 0.18),
            ...earPose(t, 0.2 + thrust * 0.15),
        }
    }
    const lunge = strike * (1 - recover)
    const crouch = windup * (1 - strike)
    const shake = Math.sin(phase.progress * TAU * 7) * phase.recovery * (1 - phase.recovery) * (heavy ? 1.5 : 1)
    return {
        body: poseAt(
            [0.04 + crouch * (heavy ? 0.28 : 0.18) + lunge * (heavy ? 0.3 : 0.2), -shake * 0.35, -shake * 0.08],
            [0, BODY_Y - crouch * (heavy ? 0.06 : 0.04) + lunge * 0.015, BODY_Z + lunge * (heavy ? 0.18 : 0.11)],
        ),
        neck: [0.07 - windup * (heavy ? 0.22 : 0.15) + lunge * (heavy ? 0.72 : 0.52), shake * 0.4, 0],
        head: [-0.06 + windup * (heavy ? 0.16 : 0.1) - lunge * (heavy ? 0.38 : 0.26), shake, 0],
        jaw: [open, 0, 0],
        ...allLegs(0.02 + lunge * 0.3, 0.08 + lunge * 0.2, -0.02 + lunge * 0.05),
        ...tailPose(t, 2.4 + segment.step * 0.4, 0.16, -shake * 0.8 - lunge * 0.12),
        ...earPose(t, windup * (1 - strike) * 0.22 + strike * 0.24),
    }
}

const swordPose = (segment: AttackSegment, t: number): JointEulers => {
    const phase = attackPhaseProgress(t, segment)
    const heavy = segment.key === 'heavy'
    const step = segment.step
    const air = segment.key === 'air'
    const windup = easeOutCubic(phase.windup)
    const strike = easeInCubic(phase.strike)
    const recover = smoothstep(phase.recovery)
    const follow = strike * (1 - recover)
    /* 蓄势量在恢复段内归零：避免攻击结束后仍残留扭头 / 侧倾 / 抬腿姿态 */
    const coil = windup * (1 - recover)
    if (heavy) {
        const spin = TAU * easeInOutCubic(phase.strike)
        /* 身体完成整周旋转；颈 / 头只做「拧入」偏移，不能叠加整周分量（否则收招残 72° 扭头） */
        const turn = -coil * 0.55
        return {
            body: poseAt(
                [0.1 + coil * 0.1 - follow * 0.12, turn - spin, -coil * 0.06],
                [0, BODY_Y - coil * 0.05 + follow * 0.01, BODY_Z],
            ),
            neck: [0.02 + coil * 0.15 - follow * 0.1, turn * 0.15, 0],
            head: [-0.08, turn * 0.2, 0],
            jaw: [0.06 + coil * 0.1, 0, 0],
            ...allLegs(0.18 + coil * 0.25, 0.3 + coil * 0.2, 0.05 + coil * 0.05),
            ...tailPose(t, 5.5, 0.22, follow * 1.1),
            ...earPose(t, 0.2 + follow * 0.25),
        }
    }
    const side = step === 1 ? 1 : step === 2 ? -1 : 0
    const chop = step === 3
    const yaw = coil * -side * 0.5 + follow * side * 1.2
    const bodyYaw = chop ? -coil * 0.12 + follow * 0.15 : -yaw * 0.38
    const bodyPitch = chop
        ? 0.02 + coil * 0.08 + follow * 0.24
        : 0.04 + coil * 0.05 - follow * 0.04
    return {
        body: poseAt(
            [bodyPitch + (air ? -0.08 : 0), bodyYaw, chop ? 0 : -side * follow * 0.14],
            [0, BODY_Y + Math.sin(follow * Math.PI) * 0.018, BODY_Z + (air ? follow * 0.04 : 0)],
        ),
        neck: chop
            ? [0.04 - coil * 0.18 + follow * 0.5, yaw * 0.2, side * follow * 0.05]
            : [0.02 + coil * 0.08 - follow * 0.06, yaw * 0.9, -side * follow * 0.08],
        head: chop
            ? [-0.04 + coil * 0.12 + follow * 0.18, yaw * 0.3, 0]
            : [-0.03, yaw * 0.55, side * follow * 0.18],
        jaw: [chop ? 0.08 + follow * 0.12 : 0.06, 0, 0],
        ...(air ? allLegs(0.45, 0.75, 0.18) : trotPose(phase.progress * 0.75, 0.18 + coil * 0.04)),
        ...tailPose(t, 4.2, 0.2, -yaw * 0.6 + (chop ? follow * 0.2 : 0)),
        ...earPose(t, 0.15 + coil * 0.15 + strike * 0.1),
    }
}

/** 攻击姿态：按段 id 区分撕咬 / 口含剑 */
export const wolfAttackPose = (segment: AttackSegment): PoseFunction => (t) =>
    segment.id.includes('sword') ? swordPose(segment, t) : bitePose(segment, t)
