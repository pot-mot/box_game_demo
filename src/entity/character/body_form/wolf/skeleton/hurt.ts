import type {HurtBlockProfile} from '../../../../../character/hurt_blocks.ts'

/** 狼受击子块（头 / 颈 / 躯干 / 尾 / 四肢）：按体形语义分区 */
export const WOLF_HURT_BLOCKS: HurtBlockProfile = [
    {id: 'head', jointId: 'head', shape: {kind: 'box', half: {x: 0.16, y: 0.15, z: 0.18}}, offsetLocal: {x: 0, y: 0.02, z: 0.06}},
    {id: 'neck', jointId: 'neck', shape: {kind: 'box', half: {x: 0.15, y: 0.15, z: 0.16}}},
    /* 躯干受击箱适度收窄（原 0.21×0.2×0.55 略大） */
    {id: 'torso', jointId: 'body', shape: {kind: 'box', half: {x: 0.17, y: 0.17, z: 0.44}}},
    {id: 'tail', jointId: 'tailA', shape: {kind: 'box', half: {x: 0.06, y: 0.06, z: 0.16}}},
    {id: 'frontLeftLeg', jointId: 'flHip', shape: {kind: 'box', half: {x: 0.08, y: 0.13, z: 0.08}}, offsetLocal: {x: 0, y: -0.1, z: 0}},
    {id: 'frontRightLeg', jointId: 'frHip', shape: {kind: 'box', half: {x: 0.08, y: 0.13, z: 0.08}}, offsetLocal: {x: 0, y: -0.1, z: 0}},
    {id: 'rearLeftLeg', jointId: 'rlHip', shape: {kind: 'box', half: {x: 0.08, y: 0.13, z: 0.08}}, offsetLocal: {x: 0, y: -0.1, z: 0}},
    {id: 'rearRightLeg', jointId: 'rrHip', shape: {kind: 'box', half: {x: 0.08, y: 0.13, z: 0.08}}, offsetLocal: {x: 0, y: -0.1, z: 0}},
]
