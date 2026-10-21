import type {IkSolverId} from './joint.ts'

/** 节点 IK 默认求解器 */
export const DEFAULT_IK_SOLVER: IkSolverId = 'ccd'

/** 节点 IK 默认影响父级段数 */
export const DEFAULT_IK_CHAIN_DEPTH = 2

/** 节点 IK 影响父级段数上限 */
export const IK_CHAIN_DEPTH_MAX = 8

/** CCD IK 求解默认最大迭代次数 */
export const DEFAULT_IK_MAX_ITERATIONS = 10

/** CCD IK 求解默认收敛容差（米） */
export const DEFAULT_IK_TOLERANCE = 0.001

/** CCD 求解中向量夹角过小时跳过该关节的阈值（sin 值） */
export const IK_EPSILON = 1e-6

/** strike_peak 预设默认峰值位置 */
export const DEFAULT_STRIKE_PEAK_RATIO = 0.7

/** 轨道默认插值规格（bezier_quad + none 退化为线性） */
export const DEFAULT_TRACK_INTERPOLATION = {type: 'bezier_quad', strategy: 'none'} as const