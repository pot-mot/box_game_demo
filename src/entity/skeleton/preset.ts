import type {SkeletonDefinition} from '../../skeleton/anim/serialization.ts'
import {
    MODEL_BASE_HEIGHT,
    MODEL_BASE_WIDTH,
    HEAD_RATIO,
    BODY_RATIO,
    HIP_Y,
    HEAD_WIDTH_RATIO,
    BODY_DEPTH_RATIO,
    ARM_WIDTH_RATIO,
    LEG_WIDTH_RATIO,
    ARM_X_GAP,
    LEG_X_GAP,
} from '../../render/constants.ts'

/**
 * 人形预设骨架定义：与方块人模型（entity/character/appearance/model.ts）层级同构，
 * 另补 foot 末端关节使小腿骨骼段完整；rightHandPivot → rightWristPivot 作为手部段。
 * 比例常量来自 render 层共享定义，与生产模型一致。
 * 锚点约定：root = 脚底（落在地面 y=0，与生产模型 group 原点一致），
 * 髋部（spine 关节）与双腿髋关节均抬升到腿高 HIP_Y，骨骼段不再出现退化零长段。
 */
export const buildCharacterSkeletonDefinition = (): SkeletonDefinition => {
    const bodyW = MODEL_BASE_WIDTH
    const bodyH = MODEL_BASE_HEIGHT * BODY_RATIO
    const headH = MODEL_BASE_HEIGHT * HEAD_RATIO
    const hipH = HIP_Y / 2
    const shinH = HIP_Y / 2
    const upperArmH = bodyH / 2
    const forearmH = bodyH / 2
    const shoulderX = bodyW / 2 + ARM_X_GAP
    const hipX = LEG_X_GAP
    const identity: readonly [number, number, number, number] = [0, 0, 0, 1]

    return {
        joints: [
            {id: 'root', name: '根', position: [0, 0, 0], rotation: identity},
            {id: 'spine', name: '髋部', parentId: 'root', position: [0, HIP_Y, 0], rotation: identity},
            {id: 'headNeck', name: '颈部', parentId: 'spine', position: [0, bodyH, 0], rotation: identity},
            {id: 'headTop', name: '头顶', parentId: 'headNeck', position: [0, headH, 0], rotation: identity},
            {id: 'rightArmShoulder', name: '右肩', parentId: 'spine', position: [shoulderX, bodyH, 0], rotation: identity},
            {id: 'rightArmElbow', name: '右肘', parentId: 'rightArmShoulder', position: [0, -upperArmH, 0], rotation: identity},
            {id: 'rightHandPivot', name: '右手', parentId: 'rightArmElbow', position: [0, -forearmH, 0], rotation: identity},
            {id: 'rightWristPivot', name: '右腕', parentId: 'rightHandPivot', position: [0, 0, 0], rotation: identity},
            {id: 'leftArmShoulder', name: '左肩', parentId: 'spine', position: [-shoulderX, bodyH, 0], rotation: identity},
            {id: 'leftArmElbow', name: '左肘', parentId: 'leftArmShoulder', position: [0, -upperArmH, 0], rotation: identity},
            {id: 'leftHandPivot', name: '左手', parentId: 'leftArmElbow', position: [0, -forearmH, 0], rotation: identity},
            {id: 'leftWristPivot', name: '左腕', parentId: 'leftHandPivot', position: [0, 0, 0], rotation: identity},
            {id: 'rightLegHip', name: '右髋', parentId: 'root', position: [hipX, HIP_Y, 0], rotation: identity},
            {id: 'rightLegKnee', name: '右膝', parentId: 'rightLegHip', position: [0, -hipH, 0], rotation: identity},
            {id: 'rightFoot', name: '右脚', parentId: 'rightLegKnee', position: [0, -shinH, 0], rotation: identity},
            {id: 'leftLegHip', name: '左髋', parentId: 'root', position: [-hipX, HIP_Y, 0], rotation: identity},
            {id: 'leftLegKnee', name: '左膝', parentId: 'leftLegHip', position: [0, -hipH, 0], rotation: identity},
            {id: 'leftFoot', name: '左脚', parentId: 'leftLegKnee', position: [0, -shinH, 0], rotation: identity},
        ],
        bones: [
            /* 躯干段沿脊柱向上（髋部 → 肩部）；头部段 = 颈根 → 头顶，与向上挂载的头部件同轴 */
            {id: 'torso', name: '躯干', headJointId: 'spine', tailJointId: 'headNeck', length: bodyH, roll: 0},
            {id: 'head', name: '头部', headJointId: 'headNeck', tailJointId: 'headTop', length: headH, roll: 0},
            {id: 'rightUpperArm', name: '右上臂', headJointId: 'rightArmShoulder', tailJointId: 'rightArmElbow', length: upperArmH, roll: 0},
            {id: 'rightForearm', name: '右前臂', headJointId: 'rightArmElbow', tailJointId: 'rightHandPivot', length: forearmH, roll: 0},
            {id: 'rightHand', name: '右手', headJointId: 'rightHandPivot', tailJointId: 'rightWristPivot', length: 0, roll: 0},
            {id: 'leftUpperArm', name: '左上臂', headJointId: 'leftArmShoulder', tailJointId: 'leftArmElbow', length: upperArmH, roll: 0},
            {id: 'leftForearm', name: '左前臂', headJointId: 'leftArmElbow', tailJointId: 'leftHandPivot', length: forearmH, roll: 0},
            {id: 'leftHand', name: '左手', headJointId: 'leftHandPivot', tailJointId: 'leftWristPivot', length: 0, roll: 0},
            {id: 'rightThigh', name: '右大腿', headJointId: 'rightLegHip', tailJointId: 'rightLegKnee', length: hipH, roll: 0},
            {id: 'rightShin', name: '右小腿', headJointId: 'rightLegKnee', tailJointId: 'rightFoot', length: shinH, roll: 0},
            {id: 'leftThigh', name: '左大腿', headJointId: 'leftLegHip', tailJointId: 'leftLegKnee', length: hipH, roll: 0},
            {id: 'leftShin', name: '左小腿', headJointId: 'leftLegKnee', tailJointId: 'leftFoot', length: shinH, roll: 0},
        ],
    }
}

/** 预设部件尺寸（与骨架定义同构，供外观装配使用） */
export const PRESET_PART_SIZES = {
    bodyW: MODEL_BASE_WIDTH,
    bodyH: MODEL_BASE_HEIGHT * BODY_RATIO,
    bodyD: MODEL_BASE_WIDTH * BODY_DEPTH_RATIO,
    headW: MODEL_BASE_WIDTH * HEAD_WIDTH_RATIO,
    headH: MODEL_BASE_HEIGHT * HEAD_RATIO,
    armW: MODEL_BASE_WIDTH * ARM_WIDTH_RATIO,
    armD: MODEL_BASE_WIDTH * ARM_WIDTH_RATIO,
    upperArmH: MODEL_BASE_HEIGHT * BODY_RATIO / 2,
    forearmH: MODEL_BASE_HEIGHT * BODY_RATIO / 2,
    legW: MODEL_BASE_WIDTH * LEG_WIDTH_RATIO,
    legD: MODEL_BASE_WIDTH * LEG_WIDTH_RATIO,
    thighH: HIP_Y / 2,
    shinH: HIP_Y / 2,
} as const