import type {JointEulers} from '../creature_runtime/pose.ts'

/** 人形语义骨架关节 id（供函数编排脚本使用） */
export const HUMANOID_RIG_JOINTS = {
    spine: 'spine',
    headNeck: 'headNeck',
    rightArmShoulder: 'rightArmShoulder',
    rightArmElbow: 'rightArmElbow',
    leftArmShoulder: 'leftArmShoulder',
    leftArmElbow: 'leftArmElbow',
    rightLegHip: 'rightLegHip',
    rightLegKnee: 'rightLegKnee',
    rightFoot: 'rightFoot',
    leftLegHip: 'leftLegHip',
    leftLegKnee: 'leftLegKnee',
    leftFoot: 'leftFoot',
} as const

/** 人形肢体侧（与 canonical 右撇子骨架一致，不做屏幕左右映射） */
export const HUMANOID_SIDES = ['left', 'right'] as const
export type HumanoidSide = typeof HUMANOID_SIDES[number]

const legJointOf = (side: HumanoidSide, part: 'Hip' | 'Knee' | 'Foot'): string =>
    `${side}Leg${part}`

/** 头部偏转：yaw 左右、pitch 上下、roll 侧倾（弧度，相对静止姿态） */
export const headTurn = (yaw: number, pitch = 0, roll = 0): JointEulers => ({
    [HUMANOID_RIG_JOINTS.headNeck]: [pitch, yaw, roll],
})

/** 躯干弯曲：pitch 前后、yaw 拧腰、roll 侧倾（弧度）；只驱动 `spine` 一个关节 */
export const spineBend = (pitch: number, yaw = 0, roll = 0): JointEulers => ({
    [HUMANOID_RIG_JOINTS.spine]: [pitch, yaw, roll],
})

/** 髋关节摆动（抬腿 / 后摆）：pitch 前后、roll 外展（弧度） */
export const hipSwing = (side: HumanoidSide, pitch: number, roll = 0): JointEulers => ({
    [legJointOf(side, 'Hip')]: [pitch, 0, roll],
})

/** 膝关节屈曲（弧度，正值 = 小腿向后折） */
export const kneeBend = (side: HumanoidSide, bend: number): JointEulers => ({
    [legJointOf(side, 'Knee')]: [bend, 0, 0],
})

/** 踝关节俯仰（弧度） */
export const anklePitch = (side: HumanoidSide, pitch: number): JointEulers => ({
    [legJointOf(side, 'Foot')]: [pitch, 0, 0],
})

/** 抬腿：髋前摆 + 膝屈曲（两个关节；lift > 0 抬向身体前方） */
export const legLift = (side: HumanoidSide, lift: number, knee = lift): JointEulers => ({
    [legJointOf(side, 'Hip')]: [-lift, 0, 0],
    [legJointOf(side, 'Knee')]: [knee, 0, 0],
})

/** 右臂抬起 + 肘部弯曲（raise 越大越向侧面抬起） */
export const rightArmWave = (raise: number, elbowBend: number, wave: number): JointEulers => ({
    [HUMANOID_RIG_JOINTS.rightArmShoulder]: [0, 0, -raise],
    [HUMANOID_RIG_JOINTS.rightArmElbow]: [0, wave, -elbowBend],
})

/** 左臂抬起 + 肘部弯曲 */
export const leftArmWave = (raise: number, elbowBend: number, wave: number): JointEulers => ({
    [HUMANOID_RIG_JOINTS.leftArmShoulder]: [0, 0, raise],
    [HUMANOID_RIG_JOINTS.leftArmElbow]: [0, -wave, elbowBend],
})

/** 单侧手臂摆动：肩 pitch / 肘屈曲（两个关节；side = canonical 解剖侧） */
export const armSwing = (side: HumanoidSide, shoulderPitch: number, elbowBend: number): JointEulers => ({
    [side === 'right' ? HUMANOID_RIG_JOINTS.rightArmShoulder : HUMANOID_RIG_JOINTS.leftArmShoulder]: [shoulderPitch, 0, 0],
    [side === 'right' ? HUMANOID_RIG_JOINTS.rightArmElbow : HUMANOID_RIG_JOINTS.leftArmElbow]: [0, 0, side === 'right' ? -elbowBend : elbowBend],
})
