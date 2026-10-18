import type {SkeletonDefinition} from '../../../../skeleton/anim/serialization.ts'

const I: readonly [number, number, number, number] = [0, 0, 0, 1]
/** 绕 X 轴 90°（把竖直胶囊转为沿身体前后轴的横胶囊） */
const QX90: readonly [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]

/**
 * 马（四足，颈长腿高）骨架：原点在脚底；原点高约 1.9。
 * `body` 为躯干根；向前自**胸口**（`withers` 颈根，身体前方而非中心）竖起的颈 `withers→neck→head`
 * （口部挂点 `mouthMount`）；向后 `tailA→tailB`；四肢三段。
 * `bodyCollider` 为物理碰撞节点（单位旋转：竖直胶囊从脚底到背部）。
 */
export const buildHorseSkeleton = (): SkeletonDefinition => ({
    joints: [
        {id: 'root', name: '根', position: [0, 0, 0], rotation: I},
        {id: 'body', name: '躯干', parentId: 'root', position: [0, 0.95, 0.05], rotation: I},
        {id: 'bodyCollider', name: '主碰撞体（竖胶囊·落地）', parentId: 'root', position: [0, 0.95, 0.05], rotation: I},
        {id: 'torsoCollider', name: '桶状碰撞体（横胶囊·体长）', parentId: 'root', position: [0, 0.95, -0.1], rotation: QX90},
        {id: 'headCollider', name: '头颈碰撞体', parentId: 'root', position: [0, 1.5, 0.7], rotation: I},
        /* 踢击挂点（前踢）：前下方，供天然 `horse_kick` 命中盒定位 */
        {id: 'kickMount', name: '踢击挂点', parentId: 'root', position: [0, 0.65, 0.75], rotation: I},

        {id: 'withers', name: '颈根', parentId: 'body', position: [0, 0.3, 0.42], rotation: I},
        {id: 'neck', name: '颈', parentId: 'withers', position: [0, 0.31, 0.12], rotation: I},
        {id: 'head', name: '头', parentId: 'neck', position: [0, 0.27, 0.21], rotation: I},
        {id: 'mouthMount', name: '口部挂点', parentId: 'head', position: [0, -0.05, 0.4], rotation: I},

        {id: 'tailA', name: '尾根', parentId: 'body', position: [0, 0.15, -0.55], rotation: I},
        {id: 'tailB', name: '尾尖', parentId: 'tailA', position: [0, 0.05, -0.35], rotation: I},

        {id: 'flHip', name: '左前髋', parentId: 'body', position: [-0.18, -0.15, 0.42], rotation: I},
        {id: 'flKnee', name: '左前膝', parentId: 'flHip', position: [0, -0.4, 0], rotation: I},
        {id: 'flFoot', name: '左前足', parentId: 'flKnee', position: [0, -0.4, 0], rotation: I},
        {id: 'frHip', name: '右前髋', parentId: 'body', position: [0.18, -0.15, 0.42], rotation: I},
        {id: 'frKnee', name: '右前膝', parentId: 'frHip', position: [0, -0.4, 0], rotation: I},
        {id: 'frFoot', name: '右前足', parentId: 'frKnee', position: [0, -0.4, 0], rotation: I},
        {id: 'rlHip', name: '左后髋', parentId: 'body', position: [-0.18, -0.15, -0.4], rotation: I},
        {id: 'rlKnee', name: '左后膝', parentId: 'rlHip', position: [0, -0.4, 0], rotation: I},
        {id: 'rlFoot', name: '左后足', parentId: 'rlKnee', position: [0, -0.4, 0], rotation: I},
        {id: 'rrHip', name: '右后髋', parentId: 'body', position: [0.18, -0.15, -0.4], rotation: I},
        {id: 'rrKnee', name: '右后膝', parentId: 'rrHip', position: [0, -0.4, 0], rotation: I},
        {id: 'rrFoot', name: '右后足', parentId: 'rrKnee', position: [0, -0.4, 0], rotation: I},
    ],
    bones: [],
})
