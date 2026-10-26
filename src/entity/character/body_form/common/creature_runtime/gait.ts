/**
 * 生物程序化动作工具：足部步态、相位跟随与缓动。
 * 只提供纯函数，供各体形 `pose_fns.ts` 组合，不做体形参数化。
 */

export const TAU = Math.PI * 2

export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export const smoothstep = (value: number): number => {
    const t = clamp01(value)
    return t * t * (3 - 2 * t)
}

export const easeInCubic = (value: number): number => {
    const t = clamp01(value)
    return t * t * t
}

export const easeOutCubic = (value: number): number => {
    const t = clamp01(value)
    const inv = 1 - t
    return 1 - inv * inv * inv
}

export const easeInOutCubic = (value: number): number => {
    const t = clamp01(value)
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** 0 → 1 → 0 的平滑脉冲（用于抬爪/甩尾的中间峰值） */
export const bell = (value: number): number => {
    const t = clamp01(value)
    return Math.sin(t * Math.PI)
}

/** 相位差（0–1 环绕） */
export const phaseOffset = (phase: number, offset: number): number => {
    const value = (phase + offset) % 1
    return value < 0 ? value + 1 : value
}

/**
 * 循环相位：把 clip 内时间归一化为 [0,1)，`t = total` 时精确回到 0。
 * 烘焙首帧（t=0）与末帧（t=total）因此取到同一姿态，循环接缝无跳变。
 */
export const cyclePhase = (t: number, total: number): number => {
    if (!(total > 0)) return 0
    const phase = (t % total) / total
    return phase < 0 ? phase + 1 : phase
}

/** 循环正弦：`cycles` 必须为整数，首尾的值与变化率才能同时相接（斜率连续） */
export const loopSin = (phase: number, cycles: number, offset = 0): number =>
    Math.sin(phase * TAU * cycles + offset)

/** 循环呼吸起伏（只返回 0–1）：`cycles` 必须为整数 */
export const loopBreath = (phase: number, cycles: number, offset = 0): number =>
    (loopSin(phase, cycles, offset) + 1) / 2

/** 单足周期采样：forward = 足端相对躯干的前后位置（+1 最前 / -1 最后），lift = 抬脚高度（0–1） */
export interface FootCycle {
    readonly forward: number
    readonly lift: number
}

/**
 * 足部周期（相位 0–1 环绕）：
 * - 支撑相（0 → stanceRatio）足掌固定，`forward` 从 +1 退到 -1（身体相对脚掌前移）；
 * - 摆动相（stanceRatio → 1）`forward` 从 -1 抬回 +1，`lift` 为钟形并在落地时归零。
 * 四足/双足髋关节的摆动方向 = `-forward * amplitude`（+X 旋转把肢体末端送向 -Z）。
 */
export const footSwing = (phase: number, stanceRatio = 0.62): FootCycle => {
    const p = clamp01(phase)
    if (p < stanceRatio) {
        const k = p / stanceRatio
        return {forward: 1 - 2 * k, lift: 0}
    }
    const k = (p - stanceRatio) / (1 - stanceRatio)
    return {forward: -1 + 2 * smoothstep(k), lift: bell(k)}
}

/** 关节相位跟随：目标值按延迟相位采样（尾巴 / 颈部滞后） */
export const lagged = (t: number, frequency: number, lag: number, amplitude: number): number =>
    Math.sin(t * frequency - lag) * amplitude
