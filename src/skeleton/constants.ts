/** CCD IK 求解默认最大迭代次数 */
export const DEFAULT_IK_MAX_ITERATIONS = 10

/** CCD IK 求解默认收敛容差（米） */
export const DEFAULT_IK_TOLERANCE = 0.001

/** CCD 求解中向量夹角过小时跳过该关节的阈值（sin 值） */
export const IK_EPSILON = 1e-6

/** strike_peak 预设默认峰值位置（同 attack_phases 的 strikePeakRatio 默认 0.7） */
export const DEFAULT_STRIKE_PEAK_RATIO = 0.7

/** 轨道默认插值规格（bezier_quad + none 退化为线性） */
export const DEFAULT_TRACK_INTERPOLATION = {type: 'bezier_quad', strategy: 'none'} as const