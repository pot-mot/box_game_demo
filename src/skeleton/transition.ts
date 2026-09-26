import {Quaternion, Vector3} from 'three'
import {DEFAULT_STRIKE_PEAK_RATIO} from './constants.ts'

export const TRANSITION_TYPES = ['linear', 'bezier_quad'] as const
export type TransitionType = typeof TRANSITION_TYPES[number]

export const EASING_STRATEGIES = ['none', 'ease_in', 'ease_out', 'strike_peak'] as const
export type EasingStrategy = typeof EASING_STRATEGIES[number]

/** 线性过渡：恒速，无缓动参数 */
export interface LinearTransition {
    readonly type: 'linear'
}

/** 二阶贝塞尔过渡：按策略取预设控制点，或自定义 cy / 峰值位置 */
export interface BezierQuadTransition {
    readonly type: 'bezier_quad'
    /** 预设缓动策略（strike_peak 走峰值曲线；none/ease_in/ease_out 走贝塞尔控制点） */
    readonly strategy: EasingStrategy
    /** 自定义控制点 cy ∈ [0,1]（Pc = (0.5, customCy)：cx 固定 0.5，
     *  越接近 0 越偏 ease_in，越接近 1 越偏 ease_out，0.5 退化为线性） */
    readonly customCy?: number
    /** strike_peak 的峰值位置 0-1（默认 0.7，同现有 strikePeakRatio） */
    readonly peakRatio?: number
}

/** 过渡规格：关键帧间插值的缓动曲线定义（判别联合，非法组合不可表达） */
export type TransitionSpec = LinearTransition | BezierQuadTransition

/** 将线性进度 p ∈ [0,1] 映射为缓动后进度（p 越界时先夹取） */
export const applyTransition = (p: number, spec: TransitionSpec): number => {
    const t = Math.min(Math.max(p, 0), 1)
    if (spec.type === 'linear') return t

    if (spec.strategy === 'strike_peak') {
        return strikePeak(t, spec.peakRatio ?? DEFAULT_STRIKE_PEAK_RATIO)
    }

    const cy = spec.customCy !== undefined
        ? Math.min(Math.max(spec.customCy, 0), 1)
        : presetCy(spec.strategy)
    /* 二阶贝塞尔 y 分量：P0=(0,0)、Pc=(0.5,cy)、P1=(1,1) → y = t² + 2t(1−t)·cy */
    return t * t + 2 * t * (1 - t) * cy
}

/** 预设策略对应的控制点 cy */
const presetCy = (strategy: EasingStrategy): number => {
    switch (strategy) {
        case 'none': return 0.5
        case 'ease_in': return 0
        case 'ease_out': return 1
        case 'strike_peak': return 0.5
    }
}

/**
 * 末端速度峰值曲线（打击手感）：峰值前加速（ease_in 段）、峰值后减速（ease_out 段），
 * 两段二阶贝塞尔在峰值处拼接；与 attack_phases.strikeCurve 数学完全一致。
 */
const strikePeak = (t: number, peak: number): number => {
    const k = Math.min(Math.max(peak, 0), 1)
    if (k <= 0) return 1 - (1 - t) * (1 - t)
    if (k >= 1) return t * t
    if (t < k) return (t * t) / k
    const u = (t - k) / (1 - k)
    return k + (1 - k) * (1 - (1 - u) * (1 - u))
}

export const lerpNumber = (a: number, b: number, k: number): number => a + (b - a) * k

export const lerpVec3 = (a: Vector3, b: Vector3, k: number): Vector3 => a.clone().lerp(b, k)

export const lerpQuat = (a: Quaternion, b: Quaternion, k: number): Quaternion => a.clone().slerp(b, k)