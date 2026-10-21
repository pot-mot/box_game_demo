import type {JointEulers} from '../creature_runtime/pose.ts'

/** 狼语义骨架关节 id（供函数编排脚本使用） */
export const WOLF_RIG_JOINTS = {
    body: 'body',
    neck: 'neck',
    head: 'head',
    jaw: 'jaw',
    tailA: 'tailA',
    tailB: 'tailB',
    tailC: 'tailC',
    earL: 'earL',
    earR: 'earR',
} as const

/** 狼四肢（fl / fr / rl / rr，canonical 解剖左右） */
export const WOLF_LEG_IDS = ['fl', 'fr', 'rl', 'rr'] as const
export type WolfLegId = typeof WOLF_LEG_IDS[number]

const LEG_JOINTS: Readonly<Record<WolfLegId, readonly [hip: string, knee: string, foot: string]>> = {
    fl: ['flHip', 'flKnee', 'flFoot'],
    fr: ['frHip', 'frKnee', 'frFoot'],
    rl: ['rlHip', 'rlKnee', 'rlFoot'],
    rr: ['rrHip', 'rrKnee', 'rrFoot'],
}

const legOf = (leg: WolfLegId): readonly [string, string, string] => LEG_JOINTS[leg]

/** 躯干俯仰（前倾 / 后坐）与侧倾：只驱动 `body`，不改变腿部落地高度 */
export const wolfBodyLean = (pitch: number, roll = 0): JointEulers => ({
    [WOLF_RIG_JOINTS.body]: [pitch, 0, roll],
})

/** 颈部俯仰 / 侧倾：只驱动 `neck` 一个关节 */
export const wolfNeckBend = (pitch: number, roll = 0): JointEulers => ({
    [WOLF_RIG_JOINTS.neck]: [pitch, 0, roll],
})

/** 头颈朝向：yaw 左右、pitch 上下（弧度，相对静止姿态） */
export const wolfHeadLook = (yaw: number, pitch = 0): JointEulers => ({
    [WOLF_RIG_JOINTS.neck]: [pitch * 0.5, yaw * 0.5, 0],
    [WOLF_RIG_JOINTS.head]: [pitch, yaw, 0],
})

/** 摇尾：phase 为连续相位（弧度），amplitude 控制摆幅 */
export const wolfTailWag = (phase: number, amplitude: number): JointEulers => ({
    [WOLF_RIG_JOINTS.tailA]: [0.02, Math.sin(phase) * amplitude, Math.cos(phase) * amplitude * 0.2],
    [WOLF_RIG_JOINTS.tailB]: [0.01, Math.sin(phase - 0.45) * amplitude * 1.2, Math.cos(phase - 0.45) * amplitude * 0.3],
    [WOLF_RIG_JOINTS.tailC]: [0, Math.sin(phase - 0.9) * amplitude * 1.4, Math.cos(phase - 0.9) * amplitude * 0.4],
})

/** 尾部抬落：只驱动尾根与尾中两节（弧度，正值抬尾） */
export const wolfTailLift = (pitch: number): JointEulers => ({
    [WOLF_RIG_JOINTS.tailA]: [pitch, 0, 0],
    [WOLF_RIG_JOINTS.tailB]: [pitch * 0.6, 0, 0],
})

/** 双耳竖起/后压（弧度） */
export const wolfEars = (perk: number): JointEulers => ({
    [WOLF_RIG_JOINTS.earL]: [perk, 0, 0],
    [WOLF_RIG_JOINTS.earR]: [perk, 0, 0],
})

/** 张口（弧度，0 = 闭合） */
export const wolfJaw = (open: number): JointEulers => ({
    [WOLF_RIG_JOINTS.jaw]: [open, 0, 0],
})

/** 髋关节摆动（抬腿 / 后蹬）：只驱动该腿的髋关节 */
export const wolfHipSwing = (leg: WolfLegId, pitch: number, roll = 0): JointEulers => ({
    [legOf(leg)[0]]: [pitch, 0, roll],
})

/** 膝关节屈曲：只驱动该腿的膝关节（正值 = 小腿向后折） */
export const wolfKneeBend = (leg: WolfLegId, bend: number): JointEulers => ({
    [legOf(leg)[1]]: [bend, 0, 0],
})

/** 踝 / 掌关节俯仰：只驱动该腿的足端关节 */
export const wolfAnklePitch = (leg: WolfLegId, pitch: number): JointEulers => ({
    [legOf(leg)[2]]: [pitch, 0, 0],
})

/** 抬腿：髋前摆 + 膝同向屈曲（两个关节；lift > 0 抬向身体前方） */
export const wolfLegLift = (leg: WolfLegId, lift: number, knee = lift): JointEulers => ({
    [legOf(leg)[0]]: [-lift, 0, 0],
    [legOf(leg)[1]]: [knee, 0, 0],
})
