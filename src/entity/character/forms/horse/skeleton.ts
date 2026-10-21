import type {SkeletonDefinition} from '../../../../skeleton/anim/serialization.ts'
import {buildBoneEdges} from '../creature_runtime/skeleton_bones.ts'

const I: readonly [number, number, number, number] = [0, 0, 0, 1]
/** 绕 X 轴 90°（把竖直胶囊转为沿身体前后轴的横胶囊） */
const QX90: readonly [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]

/**
 * 马（四足，颈长腿高）骨架：原点在脚底；原点高约 1.9。
 * `body` 为躯干根；向前自胸口竖起 `withers→neck→head`；向后 `tailA→tailB→tailC`。
 * 前肢：hip→knee→fetlock→foot；后肢：hip→knee→hock→foot（飞节反曲）。
 * `bodyCollider` 为物理碰撞节点（单位旋转：竖直胶囊从脚底到背部）。
 */
export const buildHorseSkeleton = (): SkeletonDefinition => {
    const joints: SkeletonDefinition['joints'] = [
        {id: 'root', name: '根', position: [0, 0, 0], rotation: I},
        {id: 'body', name: '躯干', parentId: 'root', position: [0, 0.95, 0.05], rotation: I},
        {id: 'bodyCollider', name: '主碰撞体（竖胶囊·落地）', parentId: 'root', position: [0, 0.95, 0.05], rotation: I},
        {id: 'torsoCollider', name: '桶状碰撞体（横胶囊·体长）', parentId: 'root', position: [0, 0.95, -0.1], rotation: QX90},
        {id: 'headCollider', name: '头颈碰撞体', parentId: 'root', position: [0, 1.5, 0.7], rotation: I},

        {id: 'withers', name: '颈根', parentId: 'body', position: [0, 0.3, 0.42], rotation: I},
        {id: 'neck', name: '颈', parentId: 'withers', position: [0, 0.31, 0.12], rotation: I},
        {id: 'head', name: '头', parentId: 'neck', position: [0, 0.27, 0.21], rotation: I},
        {id: 'mouthMount', name: '口部挂点', parentId: 'head', position: [0, -0.05, 0.4], rotation: I},
        {id: 'earL', name: '左耳', parentId: 'head', position: [-0.1, 0.16, 0.02], rotation: I},
        {id: 'earR', name: '右耳', parentId: 'head', position: [0.1, 0.16, 0.02], rotation: I},

        {id: 'tailA', name: '尾根', parentId: 'body', position: [0, 0.15, -0.55], rotation: I},
        {id: 'tailB', name: '尾中', parentId: 'tailA', position: [0, 0.04, -0.3], rotation: I},
        {id: 'tailC', name: '尾尖', parentId: 'tailB', position: [0, 0.01, -0.26], rotation: I},

        {id: 'flHip', name: '左前髋', parentId: 'body', position: [-0.18, -0.15, 0.42], rotation: I},
        {id: 'flKnee', name: '左前膝', parentId: 'flHip', position: [0, -0.4, 0], rotation: I},
        {id: 'flFetlock', name: '左前球节', parentId: 'flKnee', position: [0, -0.25, 0.01], rotation: I},
        {id: 'flFoot', name: '左前蹄', parentId: 'flFetlock', position: [0, -0.15, 0.01], rotation: I},
        {id: 'frHip', name: '右前髋', parentId: 'body', position: [0.18, -0.15, 0.42], rotation: I},
        {id: 'frKnee', name: '右前膝', parentId: 'frHip', position: [0, -0.4, 0], rotation: I},
        {id: 'frFetlock', name: '右前球节', parentId: 'frKnee', position: [0, -0.25, 0.01], rotation: I},
        {id: 'frFoot', name: '右前蹄', parentId: 'frFetlock', position: [0, -0.15, 0.01], rotation: I},
        {id: 'rlHip', name: '左后髋', parentId: 'body', position: [-0.18, -0.15, -0.4], rotation: I},
        {id: 'rlKnee', name: '左后膝', parentId: 'rlHip', position: [0, -0.36, 0.05], rotation: I},
        {id: 'rlHock', name: '左后飞节', parentId: 'rlKnee', position: [0, -0.26, -0.08], rotation: I},
        {id: 'rlFoot', name: '左后蹄', parentId: 'rlHock', position: [0, -0.18, 0.03], rotation: I},
        {id: 'rrHip', name: '右后髋', parentId: 'body', position: [0.18, -0.15, -0.4], rotation: I},
        {id: 'rrKnee', name: '右后膝', parentId: 'rrHip', position: [0, -0.36, 0.05], rotation: I},
        {id: 'rrHock', name: '右后飞节', parentId: 'rrKnee', position: [0, -0.26, -0.08], rotation: I},
        {id: 'rrFoot', name: '右后蹄', parentId: 'rrHock', position: [0, -0.18, 0.03], rotation: I},
    ]
    const bones = buildBoneEdges(joints, [
        ['spineSeg', '躯干连接', 'root', 'body'],
        ['withersSeg', '颈根', 'body', 'withers'],
        ['neckSeg', '颈', 'withers', 'neck'],
        ['headSeg', '头', 'neck', 'head'],
        ['earLSeg', '左耳', 'head', 'earL'],
        ['earRSeg', '右耳', 'head', 'earR'],
        ['tailASeg', '尾根', 'body', 'tailA'],
        ['tailBSeg', '尾中', 'tailA', 'tailB'],
        ['tailCSeg', '尾尖', 'tailB', 'tailC'],
        ['flHipSeg', '左前髋', 'body', 'flHip'],
        ['flKneeSeg', '左前膝', 'flHip', 'flKnee'],
        ['flFetlockSeg', '左前球节', 'flKnee', 'flFetlock'],
        ['flFootSeg', '左前蹄', 'flFetlock', 'flFoot'],
        ['frHipSeg', '右前髋', 'body', 'frHip'],
        ['frKneeSeg', '右前膝', 'frHip', 'frKnee'],
        ['frFetlockSeg', '右前球节', 'frKnee', 'frFetlock'],
        ['frFootSeg', '右前蹄', 'frFetlock', 'frFoot'],
        ['rlHipSeg', '左后髋', 'body', 'rlHip'],
        ['rlKneeSeg', '左后膝', 'rlHip', 'rlKnee'],
        ['rlHockSeg', '左后飞节', 'rlKnee', 'rlHock'],
        ['rlFootSeg', '左后蹄', 'rlHock', 'rlFoot'],
        ['rrHipSeg', '右后髋', 'body', 'rrHip'],
        ['rrKneeSeg', '右后膝', 'rrHip', 'rrKnee'],
        ['rrHockSeg', '右后飞节', 'rrKnee', 'rrHock'],
        ['rrFootSeg', '右后蹄', 'rrHock', 'rrFoot'],
    ])
    return {joints, bones}
}
