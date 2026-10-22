import type {HurtBlockProfile} from '../../../../character/hurt_blocks.ts'
import {PRESET_PART_SIZES} from './skeleton.ts'
import {HAND_HEIGHT_RATIO} from './constants.ts'

const s = PRESET_PART_SIZES
const handH = s.forearmH * HAND_HEIGHT_RATIO
const forearmW = s.armW * 0.8
const forearmD = s.armD * 0.8
const handW = s.armW * 0.7
const handD = s.armD * 0.7
const shinW = s.legW * 0.85
const shinD = s.legD * 0.85

/**
 * 人形受击子块清单（12 块）：头 / 躯干 / 上臂×2 / 前臂×2 / 手×2 / 大腿×2 / 小腿×2。
 * 每块 `jointId` 与 `assemble.ts` 的视觉部件挂载关节一致，运行时会读取该部件的实际尺寸
 * （长度 + 粗细）对齐；`shape.half` / `offsetLocal` 为无部件时的兜底常量。
 */
export const HUMANOID_HURT_BLOCKS: HurtBlockProfile = [
    {id: 'torso', jointId: 'spine', shape: {kind: 'box', half: {x: s.bodyW / 2, y: s.bodyH / 2, z: s.bodyD / 2}}, offsetLocal: {x: 0, y: s.bodyH / 2, z: 0}},
    {id: 'head', jointId: 'headNeck', shape: {kind: 'box', half: {x: s.headW / 2, y: s.headH / 2, z: s.headW / 2}}, offsetLocal: {x: 0, y: s.headH / 2, z: 0}},
    {id: 'rightUpperArm', jointId: 'rightArmShoulder', shape: {kind: 'box', half: {x: s.armW / 2, y: s.upperArmH / 2, z: s.armD / 2}}, offsetLocal: {x: 0, y: -s.upperArmH / 2, z: 0}},
    {id: 'rightForearm', jointId: 'rightArmElbow', shape: {kind: 'box', half: {x: forearmW / 2, y: s.forearmH / 2, z: forearmD / 2}}, offsetLocal: {x: 0, y: -s.forearmH / 2, z: 0}},
    {id: 'rightHand', jointId: 'rightHandPivot', shape: {kind: 'box', half: {x: handW / 2, y: handH / 2, z: handD / 2}}, offsetLocal: {x: 0, y: -handH / 2, z: 0}},
    {id: 'leftUpperArm', jointId: 'leftArmShoulder', shape: {kind: 'box', half: {x: s.armW / 2, y: s.upperArmH / 2, z: s.armD / 2}}, offsetLocal: {x: 0, y: -s.upperArmH / 2, z: 0}},
    {id: 'leftForearm', jointId: 'leftArmElbow', shape: {kind: 'box', half: {x: forearmW / 2, y: s.forearmH / 2, z: forearmD / 2}}, offsetLocal: {x: 0, y: -s.forearmH / 2, z: 0}},
    {id: 'leftHand', jointId: 'leftHandPivot', shape: {kind: 'box', half: {x: handW / 2, y: handH / 2, z: handD / 2}}, offsetLocal: {x: 0, y: -handH / 2, z: 0}},
    {id: 'rightThigh', jointId: 'rightLegHip', shape: {kind: 'box', half: {x: s.legW / 2, y: s.thighH / 2, z: s.legD / 2}}, offsetLocal: {x: 0, y: -s.thighH / 2, z: 0}},
    {id: 'rightShin', jointId: 'rightLegKnee', shape: {kind: 'box', half: {x: shinW / 2, y: s.shinH / 2, z: shinD / 2}}, offsetLocal: {x: 0, y: -s.shinH / 2, z: 0}},
    {id: 'leftThigh', jointId: 'leftLegHip', shape: {kind: 'box', half: {x: s.legW / 2, y: s.thighH / 2, z: s.legD / 2}}, offsetLocal: {x: 0, y: -s.thighH / 2, z: 0}},
    {id: 'leftShin', jointId: 'leftLegKnee', shape: {kind: 'box', half: {x: shinW / 2, y: s.shinH / 2, z: shinD / 2}}, offsetLocal: {x: 0, y: -s.shinH / 2, z: 0}},
]
