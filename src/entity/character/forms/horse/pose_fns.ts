import type {CharacterState} from '../../../../character/state_machine/types.ts'
import type {JointEulers, PoseFunction} from '../creature_runtime/pose.ts'

/** 马姿态函数（四足，高腿长颈）：分状态返回逐帧欧拉角。 */

const LEGS = [
    ['flHip', 'flKnee', 'flFoot'],
    ['frHip', 'frKnee', 'frFoot'],
    ['rlHip', 'rlKnee', 'rlFoot'],
    ['rrHip', 'rrKnee', 'rrFoot'],
] as const

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
    withers: [0.1 + Math.sin(t * 1.4) * 0.03, 0, 0],
    head: [-0.15, 0, 0],
    tailA: [0.2, Math.sin(t * 1.1) * 0.12, 0],
    tailB: [0, Math.sin(t * 1.1 + 0.4) * 0.12, 0],
    ...allLegs(0, 0.05, 0),
})

const walking: PoseFunction = (t) => {
    const w = t * 7
    const a = 0.6
    const bend = (phase: number): number => Math.max(0, Math.sin(phase)) * 0.5
    return {
        withers: [0.1, 0, 0],
        head: [-0.15, 0, 0],
        tailA: [0.2, Math.sin(w * 0.5) * 0.1, 0],
        flHip: [Math.sin(w) * a, 0, 0], flKnee: [bend(w), 0, 0], flFoot: [0, 0, 0],
        rrHip: [Math.sin(w) * a, 0, 0], rrKnee: [bend(w), 0, 0], rrFoot: [0, 0, 0],
        frHip: [Math.sin(w + Math.PI) * a, 0, 0], frKnee: [bend(w + Math.PI), 0, 0], frFoot: [0, 0, 0],
        rlHip: [Math.sin(w + Math.PI) * a, 0, 0], rlKnee: [bend(w + Math.PI), 0, 0], rlFoot: [0, 0, 0],
    }
}

const jumping: PoseFunction = () => ({
    withers: [0.3, 0, 0], head: [-0.2, 0, 0], tailA: [0.4, 0, 0], ...allLegs(0.8, 0.9, 0.3),
})
const falling: PoseFunction = () => ({
    withers: [0.1, 0, 0], head: [-0.1, 0, 0], tailA: [0.3, 0, 0], ...allLegs(-0.4, 0.3, 0.1),
})
const swimming: PoseFunction = (t) => {
    const w = t * 5
    return {
        body: [0.1, 0, 0], withers: [0.1, 0, 0], head: [-0.1, 0, 0], tailA: [0.2, Math.sin(w * 0.5) * 0.15, 0],
        flHip: [Math.sin(w) * 0.6, 0, 0], flKnee: [0.3, 0, 0], flFoot: [0, 0, 0],
        rrHip: [Math.sin(w) * 0.6, 0, 0], rrKnee: [0.3, 0, 0], rrFoot: [0, 0, 0],
        frHip: [Math.sin(w + Math.PI) * 0.6, 0, 0], frKnee: [0.3, 0, 0], frFoot: [0, 0, 0],
        rlHip: [Math.sin(w + Math.PI) * 0.6, 0, 0], rlKnee: [0.3, 0, 0], rlFoot: [0, 0, 0],
    }
}
const floating: PoseFunction = () => ({ body: [0.3, 0, 0], withers: [0.3, 0, 0], head: [-0.2, 0, 0], ...allLegs(0.5, 0.4, 0) })
const dying: PoseFunction = () => ({ body: [0.5, 0, 0.3], withers: [0.3, 0, 0.2], head: [0.2, 0, 0], tailA: [-0.2, 0, 0], ...allLegs(0.5, 0.8, 0.2) })
const rolling: PoseFunction = () => ({ body: [0.6, 0, 0], withers: [0.6, 0, 0], head: [0.3, 0, 0], ...allLegs(1.0, 1.0, 0.4) })
const flinching: PoseFunction = () => ({ body: [-0.2, 0, 0], withers: [-0.3, 0, 0], head: [0.2, 0, 0], ...allLegs(-0.2, 0.3, 0) })
const knockdown: PoseFunction = () => ({ body: [0.7, 0, 0.4], withers: [0.4, 0, 0.2], ...allLegs(0.5, 0.9, 0.2) })
const gettingUp: PoseFunction = (t) => {
    const k = Math.min(1, t / 0.6)
    return { body: [0.7 * (1 - k), 0, 0], withers: [0.4 * (1 - k), 0, 0], ...allLegs(0.5 * (1 - k), 0.9 * (1 - k), 0) }
}

const POSES: Partial<Record<CharacterState, PoseFunction>> = {
    walking, jumping, falling, swimming, floating, dying, rolling, flinching, knockdown, getting_up: gettingUp,
}

export const horsePose = (state: CharacterState): PoseFunction => POSES[state] ?? idle

/** 攻击姿态：light = 后腿踢击，heavy = 前冲撞 / 突刺，air = 跃起踢 */
export const horseAttackPose = (key: 'light' | 'heavy' | 'air'): PoseFunction => {
    if (key === 'heavy') {
        return (t) => {
            const thrust = Math.sin(Math.min(1, t / 0.5) * Math.PI)
            return {
                body: [thrust * 0.25, 0, 0],
                withers: [0.2 + thrust * 0.5, 0, 0],
                head: [-0.18 - thrust * 0.2, 0, 0],
                ...allLegs(-thrust * 0.3, 0.2, 0),
            }
        }
    }
    // 前蹄踢击（light / air）：后躯下沉、前腿向前上方蹬出（与朝前的检测箱 / 前蹄挂点一致）
    return (t) => {
        const k = Math.min(1, t / 0.45)
        const kick = Math.sin(k * Math.PI)
        return {
            body: [-kick * 0.35, 0, 0],
            withers: [0.3, 0, 0],
            head: [-0.2 - kick * 0.1, 0, 0],
            flHip: [kick * 1.1, 0, 0], flKnee: [-kick * 0.3, 0, 0], flFoot: [0, 0, 0],
            frHip: [kick * 1.1, 0, 0], frKnee: [-kick * 0.3, 0, 0], frFoot: [0, 0, 0],
            rlHip: [-kick * 0.15, 0, 0], rlKnee: [0.2, 0, 0], rlFoot: [0, 0, 0],
            rrHip: [-kick * 0.15, 0, 0], rrKnee: [0.2, 0, 0], rrFoot: [0, 0, 0],
        }
    }
}
