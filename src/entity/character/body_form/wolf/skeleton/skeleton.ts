import type {SkeletonDefinition} from '../../../../../skeleton/anim/serialization.ts'
import type {ColliderSpec} from '../../common/types.ts'
import {buildBoneEdges} from '../../common/creature_runtime/skeleton_bones.ts'

/** 狼碰撞布局（骨架唯一来源）：竖胶囊 + 躯干横胶囊 + 头部盒。 */
export const WOLF_COLLIDER_LAYOUT: readonly ColliderSpec[] = [
    /* 主碰撞体 = 足底小胶囊：保证四足落地；躯干 / 头使用贴合体形的横胶囊与盒 */
    {nodeId: 'groundCollider', kind: 'capsule', radius: 0.16, halfHeight: 0.02, offsetY: 0},
    {nodeId: 'bodyCollider', kind: 'capsule', radius: 0.22, halfHeight: 0.28, offsetY: 0},
    {nodeId: 'headCollider', kind: 'box', half: {x: 0.12, y: 0.13, z: 0.2}, offsetY: 0},
]

const I: readonly [number, number, number, number] = [0, 0, 0, 1]
/** 绕 X 轴 90°（把竖直胶囊转为沿身体前后轴的横胶囊） */
const QX90: readonly [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]

/**
 * 狼（四足）骨架：原点在脚底；`body` 为躯干根，向前接 `neck→head→jaw`（口部武器挂点 `mouthMount`），
 * 向后接 `tailA→tailB→tailC`；四肢各三段（hip/knee/foot），耳部两节用于程序化抖动。
 * `bodyCollider` 为物理碰撞节点（**单位旋转**：竖直胶囊从脚底到背部，保证脚不沉地），不参与动画关键帧。
 */
export const buildWolfSkeleton = (): SkeletonDefinition => {
    const joints: SkeletonDefinition['joints'] = [
        {id: 'root', name: '根', position: [0, 0, 0], rotation: I},
        {id: 'body', name: '躯干', parentId: 'root', position: [0, 0.45, 0.05], rotation: I},
        {id: 'groundCollider', name: '足底碰撞体（落地）', parentId: 'root', position: [0, 0.18, 0.05], rotation: I},
        {id: 'bodyCollider', name: '躯干碰撞体（横胶囊·体长）', parentId: 'body', position: [0, 0, 0], rotation: QX90},
        {id: 'torsoCollider', name: '备用躯干碰撞节点', parentId: 'body', position: [0, 0, -0.1], rotation: QX90},
        {id: 'headCollider', name: '头部碰撞体', parentId: 'head', position: [0, 0.02, -0.09], rotation: I},

        {id: 'neck', name: '颈', parentId: 'body', position: [0, 0.1, 0.3], rotation: I},
        {id: 'head', name: '头', parentId: 'neck', position: [0, 0.05, 0.16], rotation: I},
        {id: 'jaw', name: '下颚', parentId: 'head', position: [0, 0, 0.13], rotation: I},
        {id: 'mouthMount', name: '口部挂点', parentId: 'jaw', position: [0, -0.02, 0.12], rotation: I},
        {id: 'earL', name: '左耳', parentId: 'head', position: [-0.095, 0.15, 0.0], rotation: I},
        {id: 'earR', name: '右耳', parentId: 'head', position: [0.095, 0.15, 0.0], rotation: I},

        {id: 'tailA', name: '尾根', parentId: 'body', position: [0, 0.06, -0.28], rotation: I},
        {id: 'tailB', name: '尾中', parentId: 'tailA', position: [0, 0.03, -0.22], rotation: I},
        {id: 'tailC', name: '尾尖', parentId: 'tailB', position: [0, 0.01, -0.2], rotation: I},

        {id: 'flHip', name: '左前髋', parentId: 'body', position: [-0.1, -0.08, 0.24], rotation: I},
        {id: 'flKnee', name: '左前膝', parentId: 'flHip', position: [0, -0.2, 0], rotation: I},
        {id: 'flFoot', name: '左前足', parentId: 'flKnee', position: [0, -0.18, -0.02], rotation: I},
        {id: 'frHip', name: '右前髋', parentId: 'body', position: [0.1, -0.08, 0.24], rotation: I},
        {id: 'frKnee', name: '右前膝', parentId: 'frHip', position: [0, -0.2, 0], rotation: I},
        {id: 'frFoot', name: '右前足', parentId: 'frKnee', position: [0, -0.18, -0.02], rotation: I},
        {id: 'rlHip', name: '左后髋', parentId: 'body', position: [-0.1, -0.08, -0.18], rotation: I},
        {id: 'rlKnee', name: '左后膝', parentId: 'rlHip', position: [0, -0.2, 0], rotation: I},
        {id: 'rlFoot', name: '左后足', parentId: 'rlKnee', position: [0, -0.18, 0.02], rotation: I},
        {id: 'rrHip', name: '右后髋', parentId: 'body', position: [0.1, -0.08, -0.18], rotation: I},
        {id: 'rrKnee', name: '右后膝', parentId: 'rrHip', position: [0, -0.2, 0], rotation: I},
        {id: 'rrFoot', name: '右后足', parentId: 'rrKnee', position: [0, -0.18, 0.02], rotation: I},
    ]
    const bones = buildBoneEdges(joints, [
        ['spineSeg', '躯干连接', 'root', 'body'],
        ['neckSeg', '颈', 'body', 'neck'],
        ['headSeg', '头', 'neck', 'head'],
        ['jawSeg', '下颚', 'head', 'jaw'],
        ['earLSeg', '左耳', 'head', 'earL'],
        ['earRSeg', '右耳', 'head', 'earR'],
        ['tailASeg', '尾根', 'body', 'tailA'],
        ['tailBSeg', '尾中', 'tailA', 'tailB'],
        ['tailCSeg', '尾尖', 'tailB', 'tailC'],
        ['flHipSeg', '左前髋', 'body', 'flHip'],
        ['flKneeSeg', '左前膝', 'flHip', 'flKnee'],
        ['flFootSeg', '左前足', 'flKnee', 'flFoot'],
        ['frHipSeg', '右前髋', 'body', 'frHip'],
        ['frKneeSeg', '右前膝', 'frHip', 'frKnee'],
        ['frFootSeg', '右前足', 'frKnee', 'frFoot'],
        ['rlHipSeg', '左后髋', 'body', 'rlHip'],
        ['rlKneeSeg', '左后膝', 'rlHip', 'rlKnee'],
        ['rlFootSeg', '左后足', 'rlKnee', 'rlFoot'],
        ['rrHipSeg', '右后髋', 'body', 'rrHip'],
        ['rrKneeSeg', '右后膝', 'rrHip', 'rrKnee'],
        ['rrFootSeg', '右后足', 'rrKnee', 'rrFoot'],
    ])
    return {joints, bones}
}
