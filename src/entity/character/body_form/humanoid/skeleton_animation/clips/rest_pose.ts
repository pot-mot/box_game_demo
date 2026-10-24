import {
    MODEL_BASE_HEIGHT,
    MODEL_BASE_WIDTH,
    BODY_RATIO,
    LEG_RATIO,
    ARM_X_GAP,
    LEG_X_GAP,
} from '../../../../../../render/constants.ts'

/** 可动画关节 id 列表（与 CharacterModel 关节一一对应，顺序固定） */
export const CHARACTER_JOINT_IDS = [
    'rightArmShoulder',
    'rightArmElbow',
    'rightHandPivot',
    'rightWristPivot',
    'rightWeaponMount',
    'leftArmShoulder',
    'leftArmElbow',
    'leftHandPivot',
    'leftWristPivot',
    'leftWeaponMount',
    'rightLegHip',
    'rightLegKnee',
    'leftLegHip',
    'leftLegKnee',
    'headNeck',
    'spine',
    'root',
] as const

export type CharacterJointId = typeof CHARACTER_JOINT_IDS[number]

/** 下半身行走叠加层所用关节 */
export const WALK_LEG_JOINTS: readonly CharacterJointId[] = [
    'rightLegHip', 'rightLegKnee', 'leftLegHip', 'leftLegKnee',
]

const REST_BODY_H = MODEL_BASE_HEIGHT * BODY_RATIO
const REST_LEG_H = MODEL_BASE_HEIGHT * LEG_RATIO
const REST_UPPER_ARM_H = REST_BODY_H / 2
const REST_HIP_H = REST_LEG_H / 2
const REST_SHOULDER_X = MODEL_BASE_WIDTH / 2 + ARM_X_GAP
const REST_HIP_X = LEG_X_GAP

/** 关节静止局部位置（模型 Group 层级，相对父关节） */
export const CHARACTER_JOINT_REST_POSITIONS: Readonly<Record<CharacterJointId, readonly [number, number, number]>> = {
    rightArmShoulder: [-REST_SHOULDER_X, REST_BODY_H, 0],
    rightArmElbow: [0, -REST_UPPER_ARM_H, 0],
    rightHandPivot: [0, -REST_UPPER_ARM_H, 0],
    rightWristPivot: [0, 0, 0],
    rightWeaponMount: [0, 0, 0],
    leftArmShoulder: [REST_SHOULDER_X, REST_BODY_H, 0],
    leftArmElbow: [0, -REST_UPPER_ARM_H, 0],
    leftHandPivot: [0, -REST_UPPER_ARM_H, 0],
    leftWristPivot: [0, 0, 0],
    leftWeaponMount: [0, 0, 0],
    rightLegHip: [-REST_HIP_X, REST_LEG_H, 0],
    rightLegKnee: [0, -REST_HIP_H, 0],
    leftLegHip: [REST_HIP_X, REST_LEG_H, 0],
    leftLegKnee: [0, -REST_HIP_H, 0],
    headNeck: [0, REST_BODY_H, 0],
    spine: [0, REST_LEG_H, 0],
    root: [0, 0, 0],
}
