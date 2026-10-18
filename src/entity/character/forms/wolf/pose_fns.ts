import type {CharacterState} from '../../../../character/state_machine/types.ts'
import type {JointEulers, PoseFunction} from '../creature_runtime/pose.ts'

/**
 * 狼姿态函数（四足）：分状态返回逐帧欧拉角。仅驱动若干关节，其余保留骨架静止姿态。
 * 步态为对角小跑（fl/rr 同相、fr/rl 反相）。
 */

const LEGS = [
    ['flHip', 'flKnee', 'flFoot'],
    ['frHip', 'frKnee', 'frFoot'],
    ['rlHip', 'rlKnee', 'rlFoot'],
    ['rrHip', 'rrKnee', 'rrFoot'],
] as const

/** 四腿同姿态（tucked / spread 等） */
const allLegs = (hip: number, knee: number, foot: number): JointEulers => {
    const out: Record<string, readonly [number, number, number]> = {}
    for (const [h, k, f] of LEGS) {
        out[h] = [hip, 0, 0]
        out[k] = [knee, 0, 0]
        out[f] = [foot, 0, 0]
    }
    return out
}

const idle: PoseFunction = (t) => ({
    body: [Math.sin(t * 2) * 0.02, 0, 0],
    neck: [0.06 + Math.sin(t * 1.6) * 0.03, 0, 0],
    head: [-0.05, 0, 0],
    tailA: [0, Math.sin(t * 1.2) * 0.12, 0.12],
    tailB: [0, Math.sin(t * 1.2 + 0.5) * 0.14, 0.08],
    ...allLegs(0, 0.05, 0),
})

const walking: PoseFunction = (t) => {
    const w = t * 9
    const a = 0.5
    const bend = (phase: number): number => Math.max(0, Math.sin(phase)) * 0.6
    return {
        neck: [0.08, 0, 0],
        head: [-0.06, 0, 0],
        tailA: [0.1, Math.sin(w * 0.5) * 0.1, 0.05],
        flHip: [Math.sin(w) * a, 0, 0], flKnee: [bend(w), 0, 0], flFoot: [0, 0, 0],
        rrHip: [Math.sin(w) * a, 0, 0], rrKnee: [bend(w), 0, 0], rrFoot: [0, 0, 0],
        frHip: [Math.sin(w + Math.PI) * a, 0, 0], frKnee: [bend(w + Math.PI), 0, 0], frFoot: [0, 0, 0],
        rlHip: [Math.sin(w + Math.PI) * a, 0, 0], rlKnee: [bend(w + Math.PI), 0, 0], rlFoot: [0, 0, 0],
    }
}

const jumping: PoseFunction = () => ({
    body: [-0.15, 0, 0],
    neck: [0.1, 0, 0],
    head: [-0.1, 0, 0],
    tailA: [0.3, 0, 0],
    ...allLegs(0.7, 0.9, 0.3),
})

const falling: PoseFunction = () => ({
    body: [0.1, 0, 0],
    neck: [0.05, 0, 0],
    head: [-0.05, 0, 0],
    tailA: [0.2, 0, 0],
    ...allLegs(-0.4, 0.3, 0.2),
})

const swimming: PoseFunction = (t) => {
    const w = t * 6
    const paddle = 0.6
    return {
        body: [0.15, 0, 0],
        neck: [0.02, 0, 0],
        head: [-0.1, 0, 0],
        tailA: [0.2, Math.sin(w * 0.5) * 0.15, 0],
        flHip: [Math.sin(w) * paddle, 0, 0], flKnee: [0.3, 0, 0], flFoot: [0, 0, 0],
        rrHip: [Math.sin(w) * paddle, 0, 0], rrKnee: [0.3, 0, 0], rrFoot: [0, 0, 0],
        frHip: [Math.sin(w + Math.PI) * paddle, 0, 0], frKnee: [0.3, 0, 0], frFoot: [0, 0, 0],
        rlHip: [Math.sin(w + Math.PI) * paddle, 0, 0], rlKnee: [0.3, 0, 0], rlFoot: [0, 0, 0],
    }
}

const floating: PoseFunction = () => ({
    body: [0.35, 0, 0],
    neck: [0.15, 0, 0],
    head: [-0.15, 0, 0],
    tailA: [0.2, 0, 0],
    ...allLegs(0.5, 0.4, 0),
})

const dying: PoseFunction = () => ({
    body: [0.5, 0, 0.3],
    neck: [0.4, 0, 0.2],
    head: [0.2, 0, 0],
    tailA: [-0.2, 0, 0],
    ...allLegs(0.4, 0.8, 0.2),
})

const rolling: PoseFunction = () => ({
    body: [0.6, 0, 0],
    neck: [0.7, 0, 0],
    head: [0.3, 0, 0],
    ...allLegs(1.0, 1.0, 0.4),
})

const flinching: PoseFunction = () => ({
    body: [-0.25, 0, 0],
    neck: [-0.3, 0, 0],
    head: [0.2, 0, 0],
    tailA: [-0.2, 0, 0],
    ...allLegs(-0.2, 0.3, 0),
})

const knockdown: PoseFunction = () => ({
    body: [0.7, 0, 0.4],
    neck: [0.5, 0, 0.2],
    ...allLegs(0.5, 0.9, 0.2),
})

const gettingUp: PoseFunction = (t) => {
    const k = Math.min(1, t / 0.5)
    return {
        body: [0.7 * (1 - k), 0, 0],
        neck: [0.5 * (1 - k), 0, 0],
        ...allLegs(0.5 * (1 - k), 0.9 * (1 - k), 0),
    }
}

/** 状态 → 姿态函数（未列出的状态回退 idle） */
const POSES: Partial<Record<CharacterState, PoseFunction>> = {
    walking, jumping, falling, swimming, floating, dying, rolling, flinching, knockdown, getting_up: gettingUp,
}

export const wolfPose = (state: CharacterState): PoseFunction => POSES[state] ?? idle

/** 攻击姿态（按段 key）：light = 突进扑咬，heavy = 低头重咬，air = 空中扑击 */
export const wolfAttackPose = (key: 'light' | 'heavy' | 'air'): PoseFunction => {
    if (key === 'heavy') {
        return (t) => {
            const k = t / 0.5
            const open = k < 0.4 ? k / 0.4 : 1
            const snap = k < 0.4 ? 0 : (k - 0.4) / 0.6
            return {
                body: [0.1 - snap * 0.3, 0, 0],
                neck: [0.4 - snap * 0.7, 0, 0],
                head: [0.3 - snap * 0.5, 0, 0],
                jaw: [-open * 0.6, 0, 0],
                ...allLegs(0.2, 0.3, 0),
            }
        }
    }
    if (key === 'air') {
        return (t) => {
            const k = t / 0.4
            const thrust = Math.sin(Math.min(1, k) * Math.PI)
            return {
                body: [-0.3, 0, 0],
                neck: [thrust * 0.5, 0, 0],
                head: [thrust * 0.2, 0, 0],
                jaw: [-thrust * 0.5, 0, 0],
                ...allLegs(0.6, 0.7, 0.2),
            }
        }
    }
    return (t) => {
        const k = t / 0.4
        const thrust = Math.sin(Math.min(1, k) * Math.PI)
        return {
            body: [thrust * 0.2, 0, 0],
            neck: [thrust * 0.6, 0, 0],
            head: [thrust * 0.3, 0, 0],
            jaw: [-thrust * 0.7, 0, 0],
            ...allLegs(-thrust * 0.3, 0.2, 0),
        }
    }
}
