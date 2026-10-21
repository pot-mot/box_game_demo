import type {JointEulers} from '../creature_runtime/pose.ts'

/** 马语义骨架关节 id（供函数编排脚本使用） */
export const HORSE_RIG_JOINTS = {
    body: 'body',
    withers: 'withers',
    neck: 'neck',
    head: 'head',
    tailA: 'tailA',
    tailB: 'tailB',
    tailC: 'tailC',
    earL: 'earL',
    earR: 'earR',
} as const

/** 马四肢（fl / fr / rl / rr，canonical 解剖左右） */
export const HORSE_LEG_IDS = ['fl', 'fr', 'rl', 'rr'] as const
export type HorseLegId = typeof HORSE_LEG_IDS[number]

interface HorseLegJoints {
    readonly hip: string
    readonly knee: string
    /** 前肢球节 / 后肢飞节（反曲方向相反的下段关节） */
    readonly lower: string
    readonly foot: string
}

const LEG_JOINTS: Readonly<Record<HorseLegId, HorseLegJoints>> = {
    fl: {hip: 'flHip', knee: 'flKnee', lower: 'flFetlock', foot: 'flFoot'},
    fr: {hip: 'frHip', knee: 'frKnee', lower: 'frFetlock', foot: 'frFoot'},
    rl: {hip: 'rlHip', knee: 'rlKnee', lower: 'rlHock', foot: 'rlFoot'},
    rr: {hip: 'rrHip', knee: 'rrKnee', lower: 'rrHock', foot: 'rrFoot'},
}

/** 躯干俯仰（前倾 / 后坐）与侧倾：只驱动 `body` */
export const horseBodyLean = (pitch: number, roll = 0): JointEulers => ({
    [HORSE_RIG_JOINTS.body]: [pitch, 0, roll],
})

/** 颈根（withers）弯曲：只驱动一个关节，用于拱颈 / 颈根前探 */
export const horseWithersBend = (pitch: number, yaw = 0): JointEulers => ({
    [HORSE_RIG_JOINTS.withers]: [pitch, yaw, 0],
})

/** 头颈点头：pitch 为正时低头，为负时抬头（弧度） */
export const horseHeadNod = (pitch: number): JointEulers => ({
    [HORSE_RIG_JOINTS.neck]: [pitch * 0.65, 0, 0],
    [HORSE_RIG_JOINTS.head]: [pitch, 0, 0],
})

/** 头颈侧向：yaw 左右、roll 侧倾（弧度） */
export const horseHeadTurn = (yaw: number, roll = 0): JointEulers => ({
    [HORSE_RIG_JOINTS.neck]: [0, yaw * 0.5, roll * 0.5],
    [HORSE_RIG_JOINTS.head]: [0, yaw, roll],
})

/** 马尾摆动：phase 为连续相位（弧度） */
export const horseTailSway = (phase: number, amplitude: number): JointEulers => ({
    [HORSE_RIG_JOINTS.tailA]: [0.02, Math.sin(phase) * amplitude, Math.cos(phase) * amplitude * 0.25],
    [HORSE_RIG_JOINTS.tailB]: [0.01, Math.sin(phase - 0.4) * amplitude * 1.15, Math.cos(phase - 0.4) * amplitude * 0.3],
    [HORSE_RIG_JOINTS.tailC]: [0, Math.sin(phase - 0.8) * amplitude * 1.3, Math.cos(phase - 0.8) * amplitude * 0.35],
})

/** 双耳转动（弧度） */
export const horseEars = (flick: number): JointEulers => ({
    [HORSE_RIG_JOINTS.earL]: [flick, 0, 0],
    [HORSE_RIG_JOINTS.earR]: [flick, 0, 0],
})

/** 髋关节摆动：只驱动该腿的髋关节（前肢前踢 / 后肢后踹都由此起势） */
export const horseHipSwing = (leg: HorseLegId, pitch: number, roll = 0): JointEulers => ({
    [LEG_JOINTS[leg].hip]: [pitch, 0, roll],
})

/** 膝关节屈曲：只驱动该腿的膝关节 */
export const horseKneeBend = (leg: HorseLegId, bend: number): JointEulers => ({
    [LEG_JOINTS[leg].knee]: [bend, 0, 0],
})

/** 球节 / 飞节俯仰：只驱动该腿的下段关节（前肢正、后肢负为自然反曲方向） */
export const horseLowerJointPitch = (leg: HorseLegId, pitch: number): JointEulers => ({
    [LEG_JOINTS[leg].lower]: [pitch, 0, 0],
})

/** 蹄部俯仰：只驱动该腿的蹄关节 */
export const horseHoofPitch = (leg: HorseLegId, pitch: number): JointEulers => ({
    [LEG_JOINTS[leg].foot]: [pitch, 0, 0],
})

/** 抬腿：髋前摆 + 膝屈曲（两个关节；lift > 0 抬向身体前方） */
export const horseLegLift = (leg: HorseLegId, lift: number, knee = lift): JointEulers => ({
    [LEG_JOINTS[leg].hip]: [-lift, 0, 0],
    [LEG_JOINTS[leg].knee]: [knee, 0, 0],
})
