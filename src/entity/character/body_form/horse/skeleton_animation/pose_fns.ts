import type {AttackSegment} from '../../../../../character/weapon/attack_chain.ts'
import type {CharacterStateName} from '../../../../../character/state_machine/types.ts'
import {attackPhaseProgress} from '../../common/creature_runtime/timing.ts'
import {poseAt, type JointEulers, type PoseFunction} from '../../common/creature_runtime/pose.ts'
import {clamp01, cyclePhase, easeInCubic, easeOutCubic, footSwing, loopBreath, loopSin, phaseOffset, smoothstep, TAU, type FootCycle} from '../../common/creature_runtime/gait.ts'

/** 马姿态函数（四足，高腿长颈）：四拍步态 + 躯干起伏 + 长颈/尾滞后。 */

const BODY_Y = 0.95
const BODY_Z = 0.05

type FrontLeg = readonly [hip: string, knee: string, fetlock: string, foot: string]
type RearLeg = readonly [hip: string, knee: string, hock: string, foot: string]

const FRONT: Record<'fl' | 'fr', FrontLeg> = {
    fl: ['flHip', 'flKnee', 'flFetlock', 'flFoot'],
    fr: ['frHip', 'frKnee', 'frFetlock', 'frFoot'],
}
const REAR: Record<'rl' | 'rr', RearLeg> = {
    rl: ['rlHip', 'rlKnee', 'rlHock', 'rlFoot'],
    rr: ['rrHip', 'rrKnee', 'rrHock', 'rrFoot'],
}

const allLegs = (hip: number, knee: number, fetlock: number, foot: number): JointEulers => {
    const out: Record<string, readonly [number, number, number]> = {}
    for (const leg of Object.values(FRONT)) {
        out[leg[0]] = [hip, 0, 0]
        out[leg[1]] = [knee, 0, 0]
        out[leg[2]] = [fetlock, 0, 0]
        out[leg[3]] = [foot, 0, 0]
    }
    for (const leg of Object.values(REAR)) {
        out[leg[0]] = [hip, 0, 0]
        out[leg[1]] = [knee, 0, 0]
        out[leg[2]] = [fetlock, 0, 0]
        out[leg[3]] = [foot, 0, 0]
    }
    return out
}

/** 四拍步：左后 → 左前 → 右后 → 右前；支撑相后推、摆动相抬蹄前送 */
const applyFront = (out: Record<string, readonly [number, number, number]>, leg: FrontLeg, s: FootCycle, amplitude: number): void => {
    const push = Math.max(0, -s.forward)
    out[leg[0]] = [-s.forward * amplitude, 0, 0]
    out[leg[1]] = [0.02 + s.lift * 0.9 + push * 0.1, 0, 0]
    out[leg[2]] = [-0.02 - s.lift * 0.55, 0, 0]
    out[leg[3]] = [-s.lift * 0.4 + Math.max(0, s.forward) * 0.05, 0, 0]
}

const applyRear = (out: Record<string, readonly [number, number, number]>, leg: RearLeg, s: FootCycle, amplitude: number): void => {
    const push = Math.max(0, -s.forward)
    out[leg[0]] = [-s.forward * amplitude * 0.9, 0, 0]
    out[leg[1]] = [0.08 + s.lift * 0.6 + push * 0.08, 0, 0]
    out[leg[2]] = [-0.12 - s.lift * 0.75, 0, 0]
    out[leg[3]] = [-0.03 + s.lift * 0.35, 0, 0]
}

const walkLegs = (phase: number, amplitude: number): JointEulers => {
    const out: Record<string, readonly [number, number, number]> = {}
    applyRear(out, REAR.rl, footSwing(phase, 0.62), amplitude)
    applyFront(out, FRONT.fl, footSwing(phaseOffset(phase, 0.25), 0.62), amplitude)
    applyRear(out, REAR.rr, footSwing(phaseOffset(phase, 0.5), 0.62), amplitude)
    applyFront(out, FRONT.fr, footSwing(phaseOffset(phase, 0.75), 0.62), amplitude)
    return out
}

/** 奔跑（bound）：左右腿同相，前肢 / 后肢成对交替，不再使用四拍交错步 */
const boundLegs = (phase: number, amplitude: number): JointEulers => {
    const out: Record<string, readonly [number, number, number]> = {}
    const front = footSwing(phase, 0.62)
    const rear = footSwing(phaseOffset(phase, 0.5), 0.62)
    applyFront(out, FRONT.fl, front, amplitude)
    applyFront(out, FRONT.fr, front, amplitude)
    applyRear(out, REAR.rl, rear, amplitude)
    applyRear(out, REAR.rr, rear, amplitude)
    return out
}

/** 尾部摆动：[yaw, pitch] 为各轴每 clip 周期的摆动次数 */
const tailWave = (
    phase: number,
    cycles: readonly [yaw: number, pitch: number],
    amplitude: number,
    yawBias = 0,
): JointEulers => {
    const yaw = phase * TAU * cycles[0]
    const pitch = phase * TAU * cycles[1]
    return {
        tailA: [0.1 + Math.sin(pitch) * amplitude * 0.4, yawBias + Math.sin(yaw) * amplitude, 0],
        tailB: [0.02 + Math.sin(pitch - 0.5) * amplitude * 0.55, yawBias * 1.2 + Math.sin(yaw - 0.45) * amplitude * 1.2, 0],
        tailC: [Math.sin(pitch - 0.9) * amplitude * 0.7, yawBias * 1.4 + Math.sin(yaw - 0.85) * amplitude * 1.4, 0],
    }
}

/** 循环状态尾部：各轴取整数周期，首尾严格相接 */
const loopTail = (phase: number, amplitude: number, yawBias = 0, cycles = 1): JointEulers =>
    tailWave(phase, [cycles, Math.max(1, Math.round(cycles / 2))], amplitude, yawBias)

/** 非循环状态 / 攻击：沿用绝对时间的摆动速度 */
const freeTail = (t: number, speed: number, amplitude: number, yawBias = 0): JointEulers =>
    tailWave(t, [speed / TAU, (speed * 0.5) / TAU], amplitude, yawBias)

/** 耳部抖动：[phase, cycles] 形式保证循环状态首尾一致 */
const earWave = (phase: number, cycles: number, flatten = 0): JointEulers => {
    const twitch = Math.max(0, loopSin(phase, cycles) - 0.94) * 0.5
    return {
        earL: [flatten, 0, 0.14 + twitch],
        earR: [flatten * 0.9, 0, -0.14 - twitch * 0.6],
    }
}

/** 非循环状态：沿用绝对时间的耳部抖动 */
const freeEar = (t: number, flatten = 0): JointEulers => earWave(t, 1.7 / TAU, flatten)

const idle: PoseFunction = (t, total) => {
    const phase = cyclePhase(t, total)
    const breathe = loopBreath(phase, 2)
    const shift = loopSin(phase, 1)
    return {
        body: poseAt(
            [loopSin(phase, 1) * 0.01 + shift * 0.006, loopSin(phase, 1) * 0.012, loopSin(phase, 1) * 0.008],
            [shift * 0.008, BODY_Y + breathe * 0.008, BODY_Z],
        ),
        withers: [0.1 + loopSin(phase, 2) * 0.025 + breathe * 0.01, loopSin(phase, 1) * 0.05, 0],
        neck: [0.02 + loopSin(phase, 2, 0.3) * 0.02, loopSin(phase, 1, 0.15) * 0.06, 0],
        head: [-0.15 - loopSin(phase, 2, 0.7) * 0.02, loopSin(phase, 1, 0.3) * 0.08, loopSin(phase, 1) * 0.015],
        ...loopTail(phase, 0.1, 0, 2),
        ...earWave(phase, 2),
        ...allLegs(0, 0.04, 0.02, -0.03),
        flHip: [0.01 + shift * 0.012, 0, 0],
        frHip: [0.01 - shift * 0.012, 0, 0],
    }
}

/** 待机首帧静态姿态：交互 / 格挡 / 破防等无专属动作的状态停在此姿态，避免借用 idle 的短周期摆动 */
const IDLE_BASE: JointEulers = idle(0, 1)

const walking: PoseFunction = (t, total) => {
    const phase = cyclePhase(t, total)
    const bob = loopSin(phase, 2) * 0.016
    const roll = loopSin(phase, 1) * 0.02
    return {
        body: poseAt(
            [0.012 + loopSin(phase, 2, 0.45) * 0.01, loopSin(phase, 1) * 0.014, roll],
            [loopSin(phase, 1) * 0.006, BODY_Y + bob, BODY_Z],
        ),
        withers: [0.1 - bob * 0.35 + loopSin(phase, 2, 0.7) * 0.012, loopSin(phase, 1, 0.2) * 0.03, -roll * 0.3],
        neck: [0.02 + bob * 0.3 + loopSin(phase, 2, -0.35) * 0.016, loopSin(phase, 1, 0.1) * 0.04, -roll * 0.2],
        head: [-0.15 - loopSin(phase, 2, -0.85) * 0.055, -loopSin(phase, 1) * 0.04, -roll * 0.5],
        ...walkLegs(phase, 0.55),
        ...loopTail(phase, 0.12, -loopSin(phase, 1) * 0.06, 1),
        ...earWave(phase, 1),
    }
}

/** 跑步（bound）：左右腿同相、躯干前倾、鬃尾向后拖曳 */
const sprinting: PoseFunction = (t, total) => {
    const phase = cyclePhase(t, total)
    const bob = loopSin(phase, 2) * 0.028
    const roll = loopSin(phase, 1) * 0.03
    return {
        body: poseAt(
            [0.04 + loopSin(phase, 2, 0.4) * 0.016, loopSin(phase, 1) * 0.02, roll],
            [loopSin(phase, 1) * 0.01, BODY_Y + bob, BODY_Z],
        ),
        withers: [0.16 - bob * 0.5, loopSin(phase, 1, 0.2) * 0.04, -roll * 0.4],
        neck: [0.12 + bob * 0.35, loopSin(phase, 1, 0.1) * 0.05, -roll * 0.3],
        head: [-0.28 - loopSin(phase, 2, -0.85) * 0.07, -loopSin(phase, 1) * 0.05, -roll * 0.6],
        ...boundLegs(phase, 0.82),
        ...loopTail(phase, 0.14, -loopSin(phase, 1) * 0.08, 1),
        ...earWave(phase, 1, 0.1),
    }
}

/** 飞行：四肢收拢、身体接近水平，尾巴向后伸展 */
const flying: PoseFunction = (t, total) => {
    const phase = cyclePhase(t, total)
    const bob = loopSin(phase, 1) * 0.02
    return {
        body: poseAt([-0.14 + bob * 0.25, 0, 0], [0, BODY_Y + bob, BODY_Z]),
        withers: [0.3, 0, 0], neck: [0.14, 0, 0], head: [-0.24, 0, 0],
        ...loopTail(phase, 0.1, 0.02, 1),
        flHip: [-0.62, 0, 0], flKnee: [0.72, 0, 0], flFetlock: [0.26, 0, 0], flFoot: [0.1, 0, 0],
        frHip: [-0.62, 0, 0], frKnee: [0.72, 0, 0], frFetlock: [0.26, 0, 0], frFoot: [0.1, 0, 0],
        rlHip: [0.5, 0, 0], rlKnee: [0.7, 0, 0], rlHock: [0.28, 0, 0], rlFoot: [0.12, 0, 0],
        rrHip: [0.5, 0, 0], rrKnee: [0.7, 0, 0], rrHock: [0.28, 0, 0], rrFoot: [0.12, 0, 0],
    }
}

const jumping: PoseFunction = (t) => {
    const k = clamp01(t / 0.4)
    return {
        body: poseAt([-0.2 + k * 0.1, 0, 0], [0, BODY_Y + 0.02 + k * 0.015, BODY_Z]),
        withers: [0.34 - k * 0.06, 0, 0], neck: [0.04 - k * 0.02, 0, 0], head: [-0.2, 0, 0],
        ...freeTail(t, 1.4, 0.16, 0.08),
        flHip: [-0.35 - k * 0.18, 0, 0], flKnee: [0.45 + k * 0.2, 0, 0], flFetlock: [0.2, 0, 0], flFoot: [0.08, 0, 0],
        frHip: [-0.35 - k * 0.18, 0, 0], frKnee: [0.45 + k * 0.2, 0, 0], frFetlock: [0.2, 0, 0], frFoot: [0.08, 0, 0],
        rlHip: [0.55 + k * 0.15, 0, 0], rlKnee: [0.55, 0, 0], rlHock: [0.18, 0, 0], rlFoot: [0.1, 0, 0],
        rrHip: [0.55 + k * 0.15, 0, 0], rrKnee: [0.55, 0, 0], rrHock: [0.18, 0, 0], rrFoot: [0.1, 0, 0],
    }
}

const falling: PoseFunction = (t, total) => {
    const phase = cyclePhase(t, total)
    return {
        body: poseAt([0.1, 0, 0], [0, BODY_Y, BODY_Z]),
        withers: [0.14, 0, 0], neck: [0.03, 0, 0], head: [-0.12, 0, 0],
        ...loopTail(phase, 0.14, 0.06, 1),
        flHip: [-0.5, 0, 0], flKnee: [0.4, 0, 0], flFetlock: [0.18, 0, 0], flFoot: [0.1, 0, 0],
        frHip: [-0.5, 0, 0], frKnee: [0.4, 0, 0], frFetlock: [0.18, 0, 0], frFoot: [0.1, 0, 0],
        rlHip: [0.2, 0, 0], rlKnee: [0.6, 0, 0], rlHock: [0.15, 0, 0], rlFoot: [0.1, 0, 0],
        rrHip: [0.2, 0, 0], rrKnee: [0.6, 0, 0], rrHock: [0.15, 0, 0], rrFoot: [0.1, 0, 0],
    }
}

const swimming: PoseFunction = (t, total) => {
    const phase = cyclePhase(t, total)
    return {
        body: poseAt([0.12, loopSin(phase, 1) * 0.02, 0], [0, BODY_Y + loopSin(phase, 2) * 0.008, BODY_Z]),
        withers: [0.12, 0, 0], neck: [0.03, loopSin(phase, 1, 0.2) * 0.03, 0], head: [-0.1, -loopSin(phase, 1) * 0.04, 0],
        ...walkLegs(phase, 0.65),
        ...loopTail(phase, 0.16, loopSin(phase, 1) * 0.08, 1),
    }
}

const floating: PoseFunction = (t, total) => {
    const phase = cyclePhase(t, total)
    const paddle = loopSin(phase, 1)
    return {
        body: poseAt([0.3, 0, 0], [0, BODY_Y, BODY_Z]), withers: [0.3, 0, 0], neck: [0.06, 0, 0], head: [-0.2, 0, 0],
        ...loopTail(phase, 0.12, 0, 1),
        flHip: [-0.4 + paddle * 0.18, 0, 0], flKnee: [0.55 - paddle * 0.12, 0, 0], flFetlock: [0.2, 0, 0], flFoot: [0.1, 0, 0],
        frHip: [-0.4 - paddle * 0.18, 0, 0], frKnee: [0.55 + paddle * 0.12, 0, 0], frFetlock: [0.2, 0, 0], frFoot: [0.1, 0, 0],
        rlHip: [0.5, 0, 0], rlKnee: [0.4, 0, 0], rlHock: [0.2, 0, 0], rlFoot: [0.1, 0, 0],
        rrHip: [0.5, 0, 0], rrKnee: [0.4, 0, 0], rrHock: [0.2, 0, 0], rrFoot: [0.1, 0, 0],
    }
}

const dying: PoseFunction = () => ({
    body: poseAt([0.52, 0, 0.3], [0, BODY_Y - 0.18, BODY_Z]), withers: [0.32, 0, 0.18], neck: [0.1, 0, 0.1], head: [0.2, 0, 0],
    tailA: [-0.2, 0, 0],
    ...allLegs(0.5, 0.75, 0.3, 0.15),
})

const rolling: PoseFunction = (t) => {
    const k = clamp01(t / 0.55)
    return {
        body: poseAt([0.45 + k * 0.2, 0, 0.25 * k], [0, BODY_Y - 0.15 * k, BODY_Z]),
        withers: [0.5, 0, 0], head: [0.25, 0, 0],
        ...freeTail(t, 4, 0.1), ...allLegs(0.85, 0.85, 0.35, 0.2),
    }
}

const flinching: PoseFunction = (t) => ({
    body: poseAt([-0.18, 0.03, -0.04], [0, BODY_Y, BODY_Z]), withers: [-0.25, 0, 0.1], neck: [-0.1, 0, 0.06], head: [0.2, -0.12, 0],
    ...freeTail(t, 5, 0.06), ...freeEar(t, 0.4), ...allLegs(-0.15, 0.28, 0.1, 0),
})

const knockdown: PoseFunction = () => ({
    body: poseAt([0.66, 0, 0.38], [0, BODY_Y - 0.24, BODY_Z]), withers: [0.4, 0, 0.2], head: [0.2, 0, 0],
    ...allLegs(0.45, 0.8, 0.3, 0.15),
})

const gettingUp: PoseFunction = (t) => {
    const k = smoothstep(t / 0.6)
    return {
        body: poseAt([0.66 * (1 - k), 0, 0.38 * (1 - k)], [0, BODY_Y - 0.24 * (1 - k), BODY_Z]),
        withers: [0.4 * (1 - k), 0, 0.2 * (1 - k)],
        ...allLegs(0.45 * (1 - k), 0.8 * (1 - k), 0.3 * (1 - k), 0.15 * (1 - k)),
    }
}

const POSES: Partial<Record<CharacterStateName, PoseFunction>> = {
    walking, sprinting, jumping, falling, flying, swimming, floating, dying, rolling, flinching,
    interacting: () => IDLE_BASE,
    blocking: () => IDLE_BASE,
    guard_broken: () => IDLE_BASE,
    knockdown, getting_up: gettingUp,
}

export const horsePose = (state: CharacterStateName): PoseFunction => POSES[state] ?? idle

export const horseAttackPose = (segment: AttackSegment): PoseFunction => (t) => {
    const phase = attackPhaseProgress(t, segment)
    const windup = easeOutCubic(phase.windup)
    const strike = easeInCubic(phase.strike)
    const recover = smoothstep(phase.recovery)
    const raise = windup * (1 - phase.strike)
    const kick = strike * (1 - recover)
    if (segment.key === 'air') {
        return {
            body: poseAt([-0.28 + raise * 0.05 + kick * 0.2, 0, 0], [0, BODY_Y + kick * 0.015, BODY_Z + kick * 0.04]),
            withers: [0.3 + kick * 0.08, 0, 0], neck: [0.02, 0, 0], head: [-0.25 + kick * 0.1, 0, 0],
            flHip: [raise * 0.2 - kick * 1.12, 0, 0], flKnee: [0.1 + raise * 0.3 - kick * 0.35, 0, 0], flFetlock: [0.02 - kick * 0.15, 0, 0], flFoot: [-0.03 - kick * 0.2, 0, 0],
            frHip: [raise * 0.2 - kick * 1.02, 0, 0], frKnee: [0.1 + raise * 0.3 - kick * 0.3, 0, 0], frFetlock: [0.02 - kick * 0.15, 0, 0], frFoot: [-0.03 - kick * 0.2, 0, 0],
            rlHip: [-kick * 0.2 + 0.15, 0, 0], rlKnee: [0.3 + kick * 0.1, 0, 0], rlHock: [0.1, 0, 0], rlFoot: [0, 0, 0],
            rrHip: [-kick * 0.2 + 0.15, 0, 0], rrKnee: [0.3 + kick * 0.1, 0, 0], rrHock: [0.1, 0, 0], rrFoot: [0, 0, 0],
            ...freeTail(t, 4.4, 0.2, -kick * 0.2),
        }
    }
    if (segment.key === 'heavy') {
        const slam = strike * (1 - recover)
        return {
            body: poseAt(
                [0.02 - raise * 0.38 + slam * 0.42, 0, -raise * 0.02 + slam * 0.02],
                [0, BODY_Y + raise * 0.035 - slam * 0.14, BODY_Z - raise * 0.02 + slam * 0.06],
            ),
            withers: [0.12 - raise * 0.22 + slam * 0.28, 0, 0],
            neck: [0.02 + raise * 0.12 + slam * 0.2, 0, 0],
            head: [-0.13 - raise * 0.22 + slam * 0.32, 0, 0],
            flHip: [-raise * 1.25 + slam * 0.08, 0, 0], flKnee: [0.08 + raise * 0.55 - slam * 0.14, 0, 0], flFetlock: [0.02 + raise * 0.32 - slam * 0.08, 0, 0], flFoot: [-0.03 + raise * 0.15 - slam * 0.18, 0, 0],
            frHip: [-raise * 1.18 + slam * 0.06, 0, 0], frKnee: [0.08 + raise * 0.52 - slam * 0.13, 0, 0], frFetlock: [0.02 + raise * 0.3 - slam * 0.08, 0, 0], frFoot: [-0.03 + raise * 0.14 - slam * 0.17, 0, 0],
            rlHip: [-raise * 0.12 + slam * 0.05, 0, 0], rlKnee: [0.3 + raise * 0.12, 0, 0], rlHock: [0.1 + raise * 0.05, 0, 0], rlFoot: [0, 0, 0],
            rrHip: [-raise * 0.12 + slam * 0.05, 0, 0], rrKnee: [0.3 + raise * 0.12, 0, 0], rrHock: [0.1 + raise * 0.05, 0, 0], rrFoot: [0, 0, 0],
            ...freeTail(t, 3.8, 0.2, -raise * 0.2 + slam * 0.12),
        }
    }
    if (segment.step === 2) {
        const gather = windup * (1 - phase.strike)
        return {
            body: poseAt([0.1 + gather * 0.18 - kick * 0.24, 0, gather * 0.02 - kick * 0.02], [0, BODY_Y - gather * 0.02 + kick * 0.01, BODY_Z + kick * 0.03]),
            withers: [0.2 - gather * 0.1 + kick * 0.14, 0, 0],
            neck: [0.02 - gather * 0.08 + kick * 0.06, 0, 0],
            head: [-0.13 + gather * 0.14 - kick * 0.1, 0, 0],
            flHip: [-gather * 0.15 - kick * 0.08, 0, 0], flKnee: [0.22 + gather * 0.08, 0, 0], flFetlock: [0.08, 0, 0], flFoot: [0, 0, 0],
            frHip: [-gather * 0.15 - kick * 0.08, 0, 0], frKnee: [0.22 + gather * 0.08, 0, 0], frFetlock: [0.08, 0, 0], frFoot: [0, 0, 0],
            rlHip: [-gather * 0.5 + kick * 1.2, 0, 0], rlKnee: [0.08 + gather * 0.65 - kick * 0.3, 0, 0], rlHock: [-0.12 + gather * 0.45 - kick * 0.3, 0, 0], rlFoot: [-0.03 + gather * 0.2 - kick * 0.15, 0, 0],
            rrHip: [-gather * 0.46 + kick * 1.12, 0, 0], rrKnee: [0.08 + gather * 0.62 - kick * 0.28, 0, 0], rrHock: [-0.12 + gather * 0.42 - kick * 0.28, 0, 0], rrFoot: [-0.03 + gather * 0.18 - kick * 0.14, 0, 0],
            ...freeTail(t, 4.6, 0.22, -kick * 0.25),
        }
    }
    return {
        body: poseAt([0.02 - raise * 0.3 + kick * 0.18, 0, -raise * 0.02 + kick * 0.02], [0, BODY_Y - raise * 0.015 - kick * 0.01, BODY_Z + kick * 0.05]),
        withers: [0.16 + raise * 0.12 - kick * 0.1, 0, 0],
        neck: [0.0 - raise * 0.06 + kick * 0.08, 0, 0],
        head: [-0.13 - raise * 0.18 + kick * 0.12, 0, 0],
        flHip: [raise * 0.25 - kick * 1.28, 0, -raise * 0.04], flKnee: [0.08 + raise * 0.6 - kick * 0.38, 0, 0], flFetlock: [0.02 + raise * 0.38 - kick * 0.22, 0, 0], flFoot: [-0.03 + raise * 0.2 - kick * 0.28, 0, 0],
        frHip: [raise * 0.22 - kick * 1.18, 0, raise * 0.04], frKnee: [0.08 + raise * 0.56 - kick * 0.34, 0, 0], frFetlock: [0.02 + raise * 0.36 - kick * 0.2, 0, 0], frFoot: [-0.03 + raise * 0.18 - kick * 0.26, 0, 0],
        rlHip: [0.12 + raise * 0.08, 0, 0], rlKnee: [0.3 + raise * 0.1, 0, 0], rlHock: [0.1, 0, 0], rlFoot: [0, 0, 0],
        rrHip: [0.12 + raise * 0.08, 0, 0], rrKnee: [0.3 + raise * 0.1, 0, 0], rrHock: [0.1, 0, 0], rrFoot: [0, 0, 0],
        ...freeTail(t, 3.8, 0.2, -kick * 0.2 + raise * 0.08),
    }
}
