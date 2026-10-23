import type {HurtBlockProfile} from '../../../../../character/hurt_blocks.ts'

/** 飞龙受击子块（头 / 颈 / 躯干 / 尾 / 双翼 / 双足）：全部尺寸由骨架数据声明。 */
export const WYVERN_HURT_BLOCKS: HurtBlockProfile = [
    {id: 'head', jointId: 'head', shape: {kind: 'box', half: {x: 0.22, y: 0.14, z: 0.28}}, offsetLocal: {x: 0, y: 0.04, z: 0.22}},
    {id: 'neck', jointId: 'neck', shape: {kind: 'box', half: {x: 0.18, y: 0.24, z: 0.24}}},
    {id: 'torso', jointId: 'body', shape: {kind: 'box', half: {x: 0.4, y: 0.3, z: 0.5}}},
    {id: 'tail', jointId: 'tailA', shape: {kind: 'box', half: {x: 0.16, y: 0.16, z: 0.62}}, offsetLocal: {x: 0, y: -0.08, z: -0.62}},
    {id: 'wingLeft', jointId: 'wingLBase', shape: {kind: 'box', half: {x: 0.28, y: 0.5, z: 0.42}}, offsetLocal: {x: -0.1, y: -0.32, z: 0.1}},
    {id: 'wingRight', jointId: 'wingRBase', shape: {kind: 'box', half: {x: 0.28, y: 0.5, z: 0.42}}, offsetLocal: {x: 0.1, y: -0.32, z: 0.1}},
    {id: 'leftLeg', jointId: 'lHip', shape: {kind: 'box', half: {x: 0.18, y: 0.5, z: 0.22}}, offsetLocal: {x: 0, y: -0.45, z: 0}},
    {id: 'rightLeg', jointId: 'rHip', shape: {kind: 'box', half: {x: 0.18, y: 0.5, z: 0.22}}, offsetLocal: {x: 0, y: -0.45, z: 0}},
]
