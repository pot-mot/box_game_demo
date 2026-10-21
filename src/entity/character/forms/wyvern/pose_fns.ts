import type {AttackSegment} from '../../../../character/weapon/attack_chain.ts'
import type {CharacterState} from '../../../../character/state_machine/types.ts'
import {attackPhaseProgress} from '../creature_runtime/timing.ts'
import {isPoseWithPosition, poseAt, type JointEulers, type JointPose, type PoseFunction} from '../creature_runtime/pose.ts'
import {breath, clamp01, easeInCubic, easeInOutCubic, easeOutCubic, footSwing, phaseOffset, smoothstep, TAU, type FootCycle} from '../creature_runtime/gait.ts'

/** wyvern 姿态函数（双足 + 双翼）：翼折叠撑地 / 振翅、双足行走、四节尾与翼指层次。 */

const BODY_Y = 1.0

type LegKey = readonly [hip: string, knee: string, hock: string]

const LEGS: Record<'l' | 'r', LegKey> = {
    l: ['lHip', 'lKnee', 'lHock'],
    r: ['rHip', 'rKnee', 'rHock'],
}

const allLegs = (hip: number, knee: number, hock: number): JointEulers => {
    const out: Record<string, readonly [number, number, number]> = {}
    for (const [h, k, f] of Object.values(LEGS)) {
        out[h] = [hip, 0, 0]
        out[k] = [knee, 0, 0]
        out[f] = [hock, 0, 0]
    }
    return out
}

const walkLeg = (side: 'l' | 'r', s: FootCycle): JointEulers => ({
    [`${side}Hip`]: [-s.forward * 0.52, 0, 0],
    [`${side}Knee`]: [0.04 + s.lift * 0.82, 0, 0],
    [`${side}Hock`]: [-0.04 - s.lift * 0.32 + Math.max(0, -s.forward) * 0.05, 0, 0],
})

type WingPose = {
    base: readonly [number, number, number]
    elbow: readonly [number, number, number]
    wrist: readonly [number, number, number]
    claw: readonly [number, number, number]
    finger: readonly [number, number, number]
}

const wingOf = (sign: number, pose: WingPose): JointEulers => {
    const S = sign < 0 ? 'L' : 'R'
    return {
        [`wing${S}Base`]: [pose.base[0], pose.base[1], pose.base[2] * sign],
        [`wing${S}Elbow`]: [pose.elbow[0], pose.elbow[1], pose.elbow[2] * sign],
        [`wing${S}Wrist`]: [pose.wrist[0], pose.wrist[1], pose.wrist[2] * sign],
        [`wing${S}Claw`]: [pose.claw[0], pose.claw[1], pose.claw[2] * sign],
        [`wing${S}FingerA`]: [pose.finger[0], pose.finger[1], pose.finger[2] * sign],
        [`wing${S}FingerB`]: [pose.finger[0] * 1.1, pose.finger[1] * 1.1, pose.finger[2] * 1.2 * sign],
        [`wing${S}FingerC`]: [pose.finger[0] * 1.2, pose.finger[1] * 1.2, pose.finger[2] * 1.35 * sign],
        [`wing${S}FingerD`]: [pose.finger[0] * 1.3, pose.finger[1] * 1.3, pose.finger[2] * 1.5 * sign],
    }
}

const wings = (spread: number, flap: number): JointEulers => {
    const s = clamp01(spread)
    /*
     * 翼根 Z 为正（左翼取负）才会把翼臂向外侧展开；负值会越过身体中线。
     * 翼肘 / 腕不再叠加 Z（否则前臂向内折、双爪在胸前聚拢），展开量由翼根与 X 轴振翅控制。
     */
    const pose: WingPose = {
        base: [-0.1 + flap * 0.35, 0, 0.02 + s * 0.55],
        elbow: [0.05 - flap * 0.25, 0, 0],
        wrist: [0.1 + flap * 0.2, 0, 0],
        claw: [0.1, 0, 0],
        finger: [0, 0, 0],
    }
    return {...wingOf(-1, pose), ...wingOf(1, pose)}
}

const foldedWings = (sway: number): JointEulers => wings(0.08 + sway, 0)

/** 非攻击侧翼的支撑姿态（避免单翼攻击时另一侧停在完全展开的静止姿态） */
const braceWing = (sign: number, crouch: number): JointEulers => {
    const pose: WingPose = {
        base: [-0.12 - crouch * 0.12, 0, 0.02],
        elbow: [0.08 + crouch * 0.1, 0, 0],
        wrist: [0.06, 0, 0],
        claw: [0.05, 0, 0],
        finger: [0, 0, 0],
    }
    return wingOf(sign, pose)
}

const tailPose = (t: number, speed: number, amplitude: number, yawBias = 0): JointEulers => ({
    tailA: [0.04 + Math.sin(t * speed * 0.5) * amplitude * 0.35, yawBias + Math.sin(t * speed) * amplitude, 0],
    tailB: [0.02 + Math.sin(t * speed * 0.5 - 0.5) * amplitude * 0.5, yawBias * 1.2 + Math.sin(t * speed - 0.45) * amplitude * 1.15, 0],
    tailC: [Math.sin(t * speed * 0.5 - 0.9) * amplitude * 0.65, yawBias * 1.4 + Math.sin(t * speed - 0.9) * amplitude * 1.35, 0],
    tailD: [Math.sin(t * speed * 0.5 - 1.25) * amplitude * 0.8, yawBias * 1.6 + Math.sin(t * speed - 1.3) * amplitude * 1.55, 0],
})

const idle: PoseFunction = (t) => {
    const breathe = breath(t, 1.5)
    const shift = Math.sin(t * 0.55)
    return {
        body: poseAt(
            [Math.sin(t * 1.5) * 0.012 + shift * 0.006, Math.sin(t * 0.55) * 0.01, Math.sin(t * 0.85) * 0.008],
            [shift * 0.008, BODY_Y + breathe * 0.008, 0],
        ),
        withers: [0.02 + breathe * 0.015, Math.sin(t * 0.4) * 0.03, 0],
        neck: [0.3 + Math.sin(t * 1.3) * 0.04, Math.sin(t * 0.35) * 0.08, 0],
        head: [-0.25 - Math.sin(t * 1.3 + 0.3) * 0.02, Math.sin(t * 0.35 + 0.2) * 0.1, Math.sin(t * 0.8) * 0.02],
        jaw: [Math.max(0, Math.sin(t * 0.6) - 0.9) * 0.18, 0, 0],
        ...tailPose(t, 1.2, 0.13),
        ...foldedWings(Math.sin(t * 0.9) * 0.02),
        ...allLegs(0, 0.045, 0),
        lHip: [0.01 + shift * 0.012, 0, 0],
        rHip: [0.01 - shift * 0.012, 0, 0],
    }
}

/** 待机首帧姿态（攻击 clip 的 t=0 必须回到这里，避免起手瞬间跳成另一套站姿） */
const IDLE_BASE: JointEulers = idle(0, 1)

const lerpTriple = (
    from: readonly [number, number, number],
    to: readonly [number, number, number],
    k: number,
): readonly [number, number, number] => [
    from[0] + (to[0] - from[0]) * k,
    from[1] + (to[1] - from[1]) * k,
    from[2] + (to[2] - from[2]) * k,
]

/**
 * 攻击姿态从待机姿态平滑进入：k = 0 时严格等于 idle 首帧，k = 1 时完全使用攻击姿态。
 * 这样前摇第一帧不会突然从 idle 跳到攻击预备姿，也不会在恢复末帧残留攻击姿态。
 */
const blendPoseFromIdle = (target: JointEulers, k: number, skip: readonly string[] = []): JointEulers => {
    if (k >= 1) return target
    const clamped = Math.max(0, k)
    const skipped = new Set(skip)
    const out: Record<string, JointPose> = {}
    for (const [jointId, pose] of Object.entries(target)) {
        const base = IDLE_BASE[jointId]
        if (base === undefined || skipped.has(jointId)) {
            out[jointId] = pose
            continue
        }
        const poseRotation = isPoseWithPosition(pose) ? pose.rotation : pose
        const baseRotation = isPoseWithPosition(base) ? base.rotation : base
        const rotation = lerpTriple(baseRotation, poseRotation, clamped)
        if (isPoseWithPosition(pose)) {
            const basePosition = isPoseWithPosition(base) ? base.position : pose.position
            out[jointId] = {rotation, position: lerpTriple(basePosition, pose.position, clamped)}
        } else {
            out[jointId] = rotation
        }
    }
    return out
}

const walking: PoseFunction = (t) => {
    const phase = (t % 0.85) / 0.85
    const bob = Math.sin(phase * TAU * 2) * 0.02
    const roll = Math.sin(phase * TAU) * 0.022
    const left = footSwing(phase, 0.6)
    const right = footSwing(phaseOffset(phase, 0.5), 0.6)
    return {
        body: poseAt(
            [0.04 + Math.sin(phase * TAU * 2 + 0.35) * 0.014, Math.sin(phase * TAU) * 0.02, roll],
            [Math.sin(phase * TAU) * 0.007, BODY_Y + bob, 0],
        ),
        withers: [0.02 - bob * 0.4, Math.sin(phase * TAU) * 0.03, -roll * 0.3],
        neck: [0.28 - bob * 0.55, Math.sin(phase * TAU + 0.2) * 0.04, -roll * 0.3],
        head: [-0.22 + bob * 0.3, -Math.sin(phase * TAU + 0.2) * 0.05, -roll * 0.5],
        ...tailPose(t, 2.2, 0.13, -Math.sin(phase * TAU) * 0.07),
        ...foldedWings(Math.sin(phase * TAU) * 0.03),
        ...walkLeg('l', left),
        ...walkLeg('r', right),
    }
}

const flying: PoseFunction = (t) => {
    const flap = Math.sin(t * 7)
    return {
        body: poseAt([-0.1 + flap * 0.02, 0, 0], [0, BODY_Y + Math.sin(t * 7 + 0.4) * 0.012, 0]),
        withers: [-0.05 + flap * 0.015, 0, 0],
        neck: [0.24 - flap * 0.02, 0, 0],
        head: [-0.2 + flap * 0.015, 0, 0],
        ...wings(0.93 + flap * 0.035, flap),
        ...tailPose(t, 2.8, 0.13, Math.sin(t * 3.5) * 0.04),
        ...allLegs(0.55, 0.72, 0.22),
    }
}

const jumping: PoseFunction = (t) => {
    const k = clamp01(t / 0.4)
    return {
        body: poseAt([-0.15 - k * 0.04, 0, 0], [0, BODY_Y + 0.02 + k * 0.015, 0]), withers: [-0.04, 0, 0], neck: [0.3, 0, 0], head: [-0.24, 0, 0],
        ...wings(0.55 + k * 0.1, 0.28), ...tailPose(t, 1.6, 0.16, 0.05), ...allLegs(0.8, 0.82, 0.3),
    }
}

const falling: PoseFunction = (t) => ({
    body: poseAt([0.1, 0, 0], [0, BODY_Y, 0]), withers: [0.02, 0, 0], neck: [0.2, 0, 0], head: [-0.15, 0, 0],
    ...wings(0.86, Math.sin(t * 8)), ...tailPose(t, 3.0, 0.16, 0.06), ...allLegs(-0.3, 0.35, 0.12),
})

const swimming: PoseFunction = (t) => {
    const phase = (t % 1.0) / 1.0
    const flap = Math.sin(t * 5)
    return {
        body: poseAt([0.12, Math.sin(phase * TAU) * 0.02, 0], [0, BODY_Y + Math.sin(phase * TAU * 2) * 0.008, 0]),
        withers: [0.02, 0, 0], neck: [0.15, 0, 0], head: [-0.1, 0, 0],
        ...wings(0.8, flap), ...tailPose(t, 3.4, 0.17, Math.sin(phase * TAU) * 0.08),
        lHip: [-Math.sin(phase * TAU) * 0.42, 0, 0], lKnee: [0.3 + Math.max(0, -Math.sin(phase * TAU)) * 0.2, 0, 0], lHock: [0, 0, 0],
        rHip: [Math.sin(phase * TAU) * 0.42, 0, 0], rKnee: [0.3 + Math.max(0, Math.sin(phase * TAU)) * 0.2, 0, 0], rHock: [0, 0, 0],
    }
}

const floating: PoseFunction = flying

const dying: PoseFunction = () => ({
    body: poseAt([0.5, 0, 0.3], [0, BODY_Y - 0.2, 0]), withers: [0.12, 0, 0.1], neck: [0.3, 0, 0.2], head: [0.2, 0, 0],
    ...foldedWings(0), ...allLegs(0.5, 0.8, 0.2),
})

const rolling: PoseFunction = (t) => {
    const k = clamp01(t / 0.55)
    return {
        body: poseAt([0.5 + k * 0.2, 0, 0.25 * k], [0, BODY_Y - 0.15 * k, 0]), withers: [0.1, 0, 0.1], neck: [0.55, 0, 0], head: [0.28, 0, 0],
        ...foldedWings(0), ...tailPose(t, 4, 0.1), ...allLegs(0.9, 0.9, 0.35),
    }
}

const flinching: PoseFunction = (t) => ({
    body: poseAt([-0.22, 0.04, -0.05], [0, BODY_Y, 0]), withers: [-0.05, 0, 0], neck: [-0.2, 0, 0.12], head: [0.18, -0.1, 0],
    ...foldedWings(0.02), ...tailPose(t, 5, 0.07), ...allLegs(-0.2, 0.3, 0),
})

const knockdown: PoseFunction = () => ({
    body: poseAt([0.66, 0, 0.38], [0, BODY_Y - 0.25, 0]), withers: [0.14, 0, 0.12], neck: [0.42, 0, 0.2], head: [0.2, 0, 0],
    ...foldedWings(0), ...allLegs(0.45, 0.8, 0.25),
})

const gettingUp: PoseFunction = (t) => {
    const k = smoothstep(t / 0.6)
    return {
        body: poseAt([0.66 * (1 - k), 0, 0.38 * (1 - k)], [0, BODY_Y - 0.25 * (1 - k), 0]),
        withers: [0.14 * (1 - k), 0, 0.12 * (1 - k)],
        neck: [0.42 * (1 - k), 0, 0.2 * (1 - k)],
        ...foldedWings(0), ...allLegs(0.45 * (1 - k), 0.8 * (1 - k), 0.25 * (1 - k)),
    }
}

const POSES: Partial<Record<CharacterState, PoseFunction>> = {
    walking, jumping, falling, swimming, floating, dying, rolling, flinching, knockdown, getting_up: gettingUp,
}

export const wyvernPose = (state: CharacterState): PoseFunction => POSES[state] ?? idle

const rightWingStrike = (segment: AttackSegment, t: number, sign: number): JointEulers => {
    const phase = attackPhaseProgress(t, segment)
    const windup = easeOutCubic(phase.windup)
    const strike = easeInCubic(phase.strike)
    const recover = smoothstep(phase.recovery)
    const coil = windup * (1 - phase.strike)
    const sweep = strike * (1 - recover)
    const settle = strike * (1 - recover)
    const shake = Math.sin(phase.progress * TAU * 5) * phase.recovery * (1 - phase.recovery)
    /* 前摇只做小幅抬翼，肘关节不越过待机角过多（原先 +0.5rad 会把前臂反折进躯干） */
    const pose: WingPose = {
        base: [-0.1 - coil * 0.3 + settle * 0.05, 0, 0.02 + coil * 0.4 - settle * 0.02],
        elbow: [0.05 + coil * 0.05 - settle * 0.15, 0, 0],
        wrist: [0.1 - coil * 0.5 + settle * 1.4, 0, 0],
        claw: [0.1 + settle * 0.75, 0, 0],
        finger: [-settle * 0.08, 0, 0],
    }
    return blendPoseFromIdle({
        body: poseAt(
            [0.03 - coil * 0.2 + settle * 0.22, -sign * (coil * 0.45 + sweep * 0.55), sign * (coil * 0.1 - settle * 0.18)],
            [0, BODY_Y - settle * 0.04, 0],
        ),
        withers: [0.02 - coil * 0.06 + settle * 0.08, -sign * settle * 0.22, 0],
        neck: [0.28 + coil * 0.08 + settle * 0.14, sign * (coil * 0.3 + sweep * 0.25), 0],
        head: [-0.2 - coil * 0.06 - settle * 0.1, sign * settle * 0.35 + shake * 0.12, 0],
        jaw: [Math.max(0.08, coil * 0.35 - settle * 0.2), 0, 0],
        ...wingOf(sign, pose),
        ...braceWing(-sign, settle),
        ...tailPose(t, 3.6, 0.17, -sign * settle * 0.35),
        ...allLegs(0.15 + coil * 0.2, 0.25 + settle * 0.1, 0.05),
    }, Math.max(coil, settle))
}

const biteStrike = (segment: AttackSegment, t: number): JointEulers => {
    const phase = attackPhaseProgress(t, segment)
    const windup = easeOutCubic(phase.windup)
    const strike = easeInCubic(phase.strike)
    const recover = smoothstep(phase.recovery)
    const coil = windup * (1 - phase.strike)
    const lunge = strike * (1 - recover)
    const shake = Math.sin(phase.progress * TAU * 6) * phase.recovery * (1 - phase.recovery)
    return blendPoseFromIdle({
        body: poseAt([0.05 + coil * 0.12 + lunge * 0.3, -shake * 0.3, -shake * 0.05], [0, BODY_Y - coil * 0.03 + lunge * 0.01, lunge * 0.06]),
        withers: [0.02 + coil * 0.1 + lunge * 0.06, 0, 0],
        neck: [0.28 + coil * 0.2 + lunge * 0.55, shake * 0.35, 0],
        head: [-0.2 + coil * 0.12 - lunge * 0.35, shake, 0],
        jaw: [Math.max(0, windup * 0.85 * (1 - strike * 1.3)), 0, 0],
        ...foldedWings(0.05 + coil * 0.05),
        ...tailPose(t, 3.2, 0.16, -shake * 0.7),
        ...allLegs(0.2 + lunge * 0.16, 0.3 + lunge * 0.12, 0.05),
    }, Math.max(coil, lunge))
}

const tailSpin = (segment: AttackSegment, t: number): JointEulers => {
    const phase = attackPhaseProgress(t, segment)
    const windup = easeOutCubic(phase.windup)
    const recover = smoothstep(phase.recovery)
    const coil = windup * (1 - phase.strike)
    const spin = -TAU * easeInOutCubic(phase.strike)
    /* 恢复段把甩尾滞后和扭头一起收回，避免收招后尾巴仍保持 60° 侧偏 */
    const settle = 1 - recover
    const lag = (coil * 0.5 + phase.strike) * settle
    /* 身体 yaw 含整周旋转，不能按包络回插（会在恢复段倒转一圈）；其余关节从 idle 平滑进入 */
    const active = Math.max(coil, phase.strike * settle)
    return blendPoseFromIdle({
        body: poseAt([0.02 + (coil * 0.12 - phase.strike * 0.04) * settle, coil * 0.35 * settle + spin, coil * 0.08 * settle], [0, BODY_Y - phase.strike * 0.02 * settle, 0]),
        withers: [0.02, 0, 0],
        neck: [0.25, (coil * 0.2 + phase.strike * 0.35) * settle, 0],
        head: [-0.2, (coil * 0.15 + phase.strike * 0.45) * settle, 0],
        ...wings(0.4 + coil * 0.15 * settle, 0.05),
        tailA: [0.02, lag * 0.55, 0],
        tailB: [0.02, lag * 0.75, 0],
        tailC: [0.01, lag * 0.95, 0],
        tailD: [0, lag * 1.15, 0],
        ...allLegs(0.3 + coil * 0.15 * settle, 0.35 + coil * 0.1 * settle, 0.08),
    }, active, ['body'])
}

const doubleClaw = (segment: AttackSegment, t: number): JointEulers => {
    const phase = attackPhaseProgress(t, segment)
    const windup = easeOutCubic(phase.windup)
    const strike = easeInCubic(phase.strike)
    const recover = smoothstep(phase.recovery)
    const coil = windup * (1 - phase.strike)
    const slam = strike * (1 - recover)
    const shake = Math.sin(phase.progress * TAU * 4) * phase.recovery * (1 - phase.recovery)
    const pose: WingPose = {
        base: [-0.1 - coil * 0.3 + slam * 0.05, 0, 0.02 + coil * 0.4 - slam * 0.02],
        elbow: [0.05 + coil * 0.05 - slam * 0.15, 0, 0],
        wrist: [0.1 - coil * 0.5 + slam * 1.45, 0, 0],
        claw: [0.1 + slam * 0.8, 0, 0],
        finger: [-slam * 0.08, 0, 0],
    }
    return blendPoseFromIdle({
        body: poseAt([-0.02 - coil * 0.25 + slam * 0.32, -shake * 0.2, 0], [0, BODY_Y - coil * 0.01 - slam * 0.05, slam * 0.04]),
        withers: [-0.05 - coil * 0.12 + slam * 0.18, 0, 0],
        neck: [0.28 + coil * 0.15 - slam * 0.05, 0, 0],
        head: [-0.2 - coil * 0.12 + slam * 0.12, shake, 0],
        jaw: [Math.max(0.1, coil * 0.3 + slam * 0.55), 0, 0],
        ...wingOf(-1, pose),
        ...wingOf(1, pose),
        ...tailPose(t, 3.8, 0.18, -slam * 0.2),
        ...allLegs(0.2 + coil * 0.2 + slam * 0.1, 0.3 + slam * 0.12, 0.05),
    }, Math.max(coil, slam))
}

const breathPose = (segment: AttackSegment, t: number): JointEulers => {
    const phase = attackPhaseProgress(t, segment)
    const windup = easeOutCubic(phase.windup)
    const strike = easeInCubic(phase.strike)
    const recover = smoothstep(phase.recovery)
    const inhale = windup * (1 - phase.strike)
    const blast = strike * (1 - recover)
    /* 吐息结束后收翼、合颚，回到可自然衔接待机的姿态 */
    const settle = 1 - recover
    return blendPoseFromIdle({
        body: poseAt(
            [-0.1 * settle - inhale * 0.2 + blast * 0.18, 0, 0],
            [0, BODY_Y - inhale * 0.025 + blast * 0.01, -blast * 0.045],
        ),
        withers: [-0.05 * settle - inhale * 0.12 + blast * 0.1, 0, 0],
        neck: [0.3 * settle + inhale * 0.15 + blast * 0.08, 0, 0],
        head: [-0.2 * settle - inhale * 0.12 + blast * 0.35, 0, 0],
        jaw: [Math.max(0.2 * settle, inhale * 1.0 + blast * 0.95), 0, 0],
        ...wings((0.8 + inhale * 0.12 - blast * 0.08) * settle, blast * 0.2),
        ...tailPose(t, 2.6, 0.14, -blast * 0.12),
        ...allLegs(0.2 + inhale * 0.15 + blast * 0.05, 0.3 + inhale * 0.1, 0.05),
    }, Math.max(inhale, blast))
}

/** 攻击姿态：吐息（远程模组）与爪击（五段）分离；按段 id / attackWeaponId 判别。 */
export const wyvernAttackPose = (segment: AttackSegment): PoseFunction => {
    const isBreath = segment.attackWeaponId !== undefined || segment.id.startsWith('breath_')
    if (isBreath) return (t) => breathPose(segment, t)
    if (segment.key === 'air') {
        return (t) => (segment.step === 2 ? doubleClaw(segment, t) : rightWingStrike(segment, t, segment.step === 1 ? 1 : -1))
    }
    switch (segment.step) {
        case 1: return (t) => rightWingStrike(segment, t, 1)
        case 2: return (t) => rightWingStrike(segment, t, -1)
        case 3: return (t) => biteStrike(segment, t)
        case 4: return (t) => tailSpin(segment, t)
        default: return (t) => doubleClaw(segment, t)
    }
}
