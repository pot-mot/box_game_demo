import {clamp01} from '../../common/creature_runtime/gait.ts'
import type {JointEulers} from '../../common/creature_runtime/pose.ts'

/** wyvern 语义骨架关节 id（供函数编排脚本使用） */
export const WYVERN_RIG_JOINTS = {
    body: 'body',
    withers: 'withers',
    neck: 'neck',
    head: 'head',
    jaw: 'jaw',
    tailA: 'tailA',
    tailB: 'tailB',
    tailC: 'tailC',
    tailD: 'tailD',
} as const

/** 翼侧（canonical 解剖左右；骨骼 id 使用大写 L / R） */
export const WYVERN_SIDES = ['l', 'r'] as const
export type WyvernSide = typeof WYVERN_SIDES[number]

/** 后足侧（l / r） */
export type WyvernLegId = WyvernSide

const wingPrefix = (side: WyvernSide): string => `wing${side.toUpperCase()}`

const LEG_JOINTS: Readonly<Record<WyvernLegId, readonly [hip: string, knee: string, hock: string]>> = {
    l: ['lHip', 'lKnee', 'lHock'],
    r: ['rHip', 'rKnee', 'rHock'],
}

type WingPose = {
    readonly base: readonly [number, number, number]
    readonly elbow: readonly [number, number, number]
    readonly wrist: readonly [number, number, number]
    readonly claw: readonly [number, number, number]
    readonly finger: readonly [number, number, number]
}

const wingOf = (sign: number, pose: WingPose): JointEulers => {
    const side = sign < 0 ? 'L' : 'R'
    return {
        [`wing${side}Base`]: [pose.base[0], pose.base[1], pose.base[2] * sign],
        [`wing${side}Elbow`]: [pose.elbow[0], pose.elbow[1], pose.elbow[2] * sign],
        [`wing${side}Wrist`]: [pose.wrist[0], pose.wrist[1], pose.wrist[2] * sign],
        [`wing${side}Claw`]: [pose.claw[0], pose.claw[1], pose.claw[2] * sign],
        [`wing${side}FingerA`]: [pose.finger[0], pose.finger[1], pose.finger[2] * sign],
        [`wing${side}FingerB`]: [pose.finger[0] * 1.1, pose.finger[1] * 1.1, pose.finger[2] * 1.2 * sign],
        [`wing${side}FingerC`]: [pose.finger[0] * 1.2, pose.finger[1] * 1.2, pose.finger[2] * 1.35 * sign],
        [`wing${side}FingerD`]: [pose.finger[0] * 1.3, pose.finger[1] * 1.3, pose.finger[2] * 1.5 * sign],
    }
}

/** 双翼展开/收拢：spread 0 = 收翼，1 = 完全展开；flap 控制振翅 */
export const wyvernWings = (spread: number, flap = 0): JointEulers => {
    const s = clamp01(spread)
    const pose: WingPose = {
        base: [-0.1 + flap * 0.35, 0, 0.02 + s * 0.55],
        elbow: [0.05 - flap * 0.25, 0, 0],
        wrist: [0.1 + flap * 0.2, 0, 0],
        claw: [0.1, 0, 0],
        finger: [0, 0, 0],
    }
    return {...wingOf(-1, pose), ...wingOf(1, pose)}
}

/** 单侧翼根展开：只驱动该侧 `wingBase`（spread 0 = 收，1 = 展开） */
export const wyvernWingBase = (side: WyvernSide, spread: number): JointEulers => {
    const s = clamp01(spread)
    return {
        [`${wingPrefix(side)}Base`]: [-0.1, 0, (side === 'l' ? -1 : 1) * (0.02 + s * 0.55)],
    }
}

/** 单侧翼肘屈曲：只驱动该侧 `wingElbow` */
export const wyvernWingElbowBend = (side: WyvernSide, bend: number): JointEulers => ({
    [`${wingPrefix(side)}Elbow`]: [bend, 0, 0],
})

/** 单侧翼腕俯仰：只驱动该侧 `wingWrist` */
export const wyvernWingWristPitch = (side: WyvernSide, pitch: number): JointEulers => ({
    [`${wingPrefix(side)}Wrist`]: [pitch, 0, 0],
})

/** 翼爪收张：腕爪 + 第一指（两个关节；curl > 0 收爪） */
export const wyvernWingClaw = (side: WyvernSide, curl: number): JointEulers => {
    const sign = side === 'l' ? 1 : -1
    return {
        [`${wingPrefix(side)}Claw`]: [curl, 0, sign * curl * 0.2],
        [`${wingPrefix(side)}FingerA`]: [curl * 0.6, 0, sign * curl * 0.15],
    }
}

/** 躯干俯仰（前倾 / 后坐）与侧倾：只驱动 `body` */
export const wyvernBodyLean = (pitch: number, roll = 0): JointEulers => ({
    [WYVERN_RIG_JOINTS.body]: [pitch, 0, roll],
})

/** 颈部弯曲：只驱动 `neck` 一个关节 */
export const wyvernNeckBend = (pitch: number, roll = 0): JointEulers => ({
    [WYVERN_RIG_JOINTS.neck]: [pitch, 0, roll],
})

/** 头颈朝向（弧度，相对静止姿态） */
export const wyvernHeadLook = (yaw: number, pitch = 0): JointEulers => ({
    [WYVERN_RIG_JOINTS.neck]: [pitch * 0.5, yaw * 0.5, 0],
    [WYVERN_RIG_JOINTS.head]: [pitch, yaw, 0],
})

/** 张口（弧度，0 = 闭合） */
export const wyvernJaw = (open: number): JointEulers => ({
    [WYVERN_RIG_JOINTS.jaw]: [open, 0, 0],
})

/** 四节尾摆动：phase 为连续相位（弧度） */
export const wyvernTailWag = (phase: number, amplitude: number): JointEulers => ({
    [WYVERN_RIG_JOINTS.tailA]: [0.04 + Math.sin(phase * 0.5) * amplitude * 0.35, Math.sin(phase) * amplitude, 0],
    [WYVERN_RIG_JOINTS.tailB]: [0.02 + Math.sin(phase * 0.5 - 0.5) * amplitude * 0.5, Math.sin(phase - 0.45) * amplitude * 1.15, 0],
    [WYVERN_RIG_JOINTS.tailC]: [Math.sin(phase * 0.5 - 0.9) * amplitude * 0.65, Math.sin(phase - 0.9) * amplitude * 1.35, 0],
    [WYVERN_RIG_JOINTS.tailD]: [Math.sin(phase * 0.5 - 1.25) * amplitude * 0.8, Math.sin(phase - 1.3) * amplitude * 1.55, 0],
})

/** 尾部抬落：只驱动尾根与尾中两节（弧度，正值抬尾） */
export const wyvernTailLift = (pitch: number): JointEulers => ({
    [WYVERN_RIG_JOINTS.tailA]: [pitch, 0, 0],
    [WYVERN_RIG_JOINTS.tailB]: [pitch * 0.65, 0, 0],
})

/** 髋关节摆动：只驱动该侧后足的髋关节 */
export const wyvernHipSwing = (leg: WyvernLegId, pitch: number, roll = 0): JointEulers => ({
    [LEG_JOINTS[leg][0]]: [pitch, 0, roll],
})

/** 膝关节屈曲：只驱动该侧后足的膝关节 */
export const wyvernKneeBend = (leg: WyvernLegId, bend: number): JointEulers => ({
    [LEG_JOINTS[leg][1]]: [bend, 0, 0],
})

/** 跗关节俯仰：只驱动该侧后足的跗关节 */
export const wyvernHockPitch = (leg: WyvernLegId, pitch: number): JointEulers => ({
    [LEG_JOINTS[leg][2]]: [pitch, 0, 0],
})

/** 抬腿：髋前摆 + 膝屈曲（两个关节；lift > 0 抬向身体前方） */
export const wyvernLegLift = (leg: WyvernLegId, lift: number, knee = lift): JointEulers => ({
    [LEG_JOINTS[leg][0]]: [-lift, 0, 0],
    [LEG_JOINTS[leg][1]]: [knee, 0, 0],
})
