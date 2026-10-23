import type {HurtBlockProfile} from '../../../../../character/hurt_blocks.ts'

/** 马受击子块（头 / 颈 / 躯干 / 尾 / 四肢）：全部尺寸由骨架数据声明，不读取外观几何。 */
export const HORSE_HURT_BLOCKS: HurtBlockProfile = [
    {id: 'head', jointId: 'head', shape: {kind: 'box', half: {x: 0.16, y: 0.18, z: 0.3}}, offsetLocal: {x: 0, y: 0, z: 0.18}},
    {id: 'neck', jointId: 'neck', shape: {kind: 'box', half: {x: 0.18, y: 0.26, z: 0.28}}},
    {id: 'torso', jointId: 'body', shape: {kind: 'box', half: {x: 0.26, y: 0.3, z: 0.7}}},
    {id: 'tail', jointId: 'tailA', shape: {kind: 'box', half: {x: 0.08, y: 0.08, z: 0.22}}},
    {id: 'frontLeftLeg', jointId: 'flHip', shape: {kind: 'box', half: {x: 0.11, y: 0.22, z: 0.11}}, offsetLocal: {x: 0, y: -0.2, z: 0}},
    {id: 'frontRightLeg', jointId: 'frHip', shape: {kind: 'box', half: {x: 0.11, y: 0.22, z: 0.11}}, offsetLocal: {x: 0, y: -0.2, z: 0}},
    {id: 'rearLeftLeg', jointId: 'rlHip', shape: {kind: 'box', half: {x: 0.11, y: 0.22, z: 0.11}}, offsetLocal: {x: 0, y: -0.2, z: 0}},
    {id: 'rearRightLeg', jointId: 'rrHip', shape: {kind: 'box', half: {x: 0.11, y: 0.22, z: 0.11}}, offsetLocal: {x: 0, y: -0.2, z: 0}},
]
