import type {AttackSegment} from '../../../../character/weapon/attack_chain.ts'
import type {CharacterState} from '../../../../character/state_machine/types.ts'
import type {JointEulers, PoseFunction} from '../creature_runtime/pose.ts'

/** wyvern 姿态函数（双足 + 双翼）：翼折叠（常态翼爪撑地）/ 振翅、双足行走、尾摆。 */

const LEGS = [['lHip', 'lKnee', 'lHock'], ['rHip', 'rKnee', 'rHock']] as const

const allLegs = (hip: number, knee: number, hock: number): JointEulers => {
    const out: Record<string, readonly [number, number, number]> = {}
    for (const [h, k, f] of LEGS) {
        out[h] = [hip, 0, 0]
        out[k] = [knee, 0, 0]
        out[f] = [hock, 0, 0]
    }
    return out
}

/** 翼展开（振翅：wingLBase rz 为负外张、wingRBase 为正外张） */
const wingSpread = (flap: number): JointEulers => ({
    wingLBase: [0, 0, -1.34 + flap * 0.5], wingLElbow: [0, 0, -0.5], wingLWrist: [0, 0, -0.6],
    wingRBase: [0, 0, 1.34 - flap * 0.5], wingRElbow: [0, 0, 0.5], wingRWrist: [0, 0, 0.6],
})

/** 翼折叠（常态：翼收拢、腕端勾爪撑地，四足着地） */
const wingFolded = (sway: number): JointEulers => ({
    wingLBase: [0, 0, -0.05 + sway], wingLElbow: [0, 0, -0.1], wingLWrist: [0, 0, -0.15],
    wingRBase: [0, 0, 0.05 - sway], wingRElbow: [0, 0, 0.1], wingRWrist: [0, 0, 0.15],
})

const idle: PoseFunction = (t) => ({
    body: [Math.sin(t * 1.6) * 0.02, 0, 0],
    neck: [0.3 + Math.sin(t * 1.3) * 0.04, 0, 0],
    head: [-0.25, 0, 0],
    ...wingFolded(Math.sin(t * 1.2) * 0.03),
    tailA: [0.1, Math.sin(t * 1.1) * 0.14, 0],
    tailB: [0, Math.sin(t * 1.1 + 0.5) * 0.12, 0],
    ...allLegs(0, 0.05, 0),
})

/** 振翅飞行（wingFlap） */
const flying: PoseFunction = (t) => ({
    body: [-0.1, 0, 0],
    neck: [0.25, 0, 0],
    head: [-0.2, 0, 0],
    ...wingSpread(Math.sin(t * 7)),
    tailA: [0.15, 0, 0],
    ...allLegs(0.5, 0.7, 0.2),
})

const walking: PoseFunction = (t) => {
    const w = t * 6
    const a = 0.5
    const bend = (phase: number): number => Math.max(0, Math.sin(phase)) * 0.6
    return {
        body: [0.05, 0, 0],
        neck: [0.28, 0, 0],
        head: [-0.22, 0, 0],
        ...wingFolded(Math.sin(w * 0.5) * 0.04),
        tailA: [0.1, Math.sin(w * 0.5) * 0.12, 0],
        lHip: [Math.sin(w) * a, 0, 0], lKnee: [bend(w), 0, 0], lHock: [0, 0, 0],
        rHip: [Math.sin(w + Math.PI) * a, 0, 0], rKnee: [bend(w + Math.PI), 0, 0], rHock: [0, 0, 0],
    }
}

const jumping: PoseFunction = () => ({
    body: [-0.15, 0, 0], neck: [0.35, 0, 0], head: [-0.25, 0, 0],
    ...wingFolded(0),
    ...allLegs(0.8, 0.8, 0.3),
})
const falling: PoseFunction = () => ({
    body: [0.1, 0, 0], neck: [0.2, 0, 0], head: [-0.15, 0, 0],
    wingLBase: [0, 0, -0.6], wingLElbow: [0, 0, -0.3], wingLWrist: [0, 0, -0.3],
    wingRBase: [0, 0, 0.6], wingRElbow: [0, 0, 0.3], wingRWrist: [0, 0, 0.3],
    ...allLegs(-0.3, 0.3, 0.1),
})
const swimming: PoseFunction = (t) => {
    const w = t * 5
    return {
        body: [0.1, 0, 0], neck: [0.15, 0, 0], head: [-0.1, 0, 0],
        ...wingSpread(Math.sin(w)),
        tailA: [0.15, Math.sin(w * 0.5) * 0.18, 0],
        ...allLegs(Math.sin(w) * 0.4, 0.3, 0),
    }
}
const floating: PoseFunction = flying
const dying: PoseFunction = () => ({
    body: [0.5, 0, 0.3], neck: [0.3, 0, 0.2], head: [0.2, 0, 0],
    ...wingFolded(0), ...allLegs(0.5, 0.8, 0.2),
})
const rolling: PoseFunction = () => ({
    body: [0.6, 0, 0], neck: [0.6, 0, 0], head: [0.3, 0, 0],
    ...wingFolded(0), ...allLegs(1.0, 1.0, 0.4),
})
const flinching: PoseFunction = () => ({
    body: [-0.25, 0, 0], neck: [-0.3, 0, 0], head: [0.2, 0, 0],
    ...wingFolded(0), ...allLegs(-0.2, 0.3, 0),
})
const knockdown: PoseFunction = () => ({
    body: [0.7, 0, 0.4], neck: [0.4, 0, 0.2],
    ...wingFolded(0), ...allLegs(0.5, 0.9, 0.2),
})
const gettingUp: PoseFunction = (t) => {
    const k = Math.min(1, t / 0.6)
    return {body: [0.7 * (1 - k), 0, 0], neck: [0.4 * (1 - k), 0, 0], ...wingFolded(0), ...allLegs(0.5 * (1 - k), 0.9 * (1 - k), 0)}
}

const POSES: Partial<Record<CharacterState, PoseFunction>> = {
    walking, jumping, falling, swimming, floating, dying, rolling, flinching, knockdown, getting_up: gettingUp,
}

export const wyvernPose = (state: CharacterState): PoseFunction => POSES[state] ?? idle

/** 攻击姿态：按段 id 区分吐息（ranged，id 含 `breath`）与利爪（claw，melee）；
 * 两者 segment.key 均为 'light'，故必须靠 id 判别，否则吐息会误用爪击姿态、爪击重击会误用吐息姿态。 */
export const wyvernAttackPose = (segment: AttackSegment): PoseFunction => {
    if (segment.id.includes('breath')) {
        // 昂首喷吐：张口蓄力后向前喷吐
        return (t) => {
            const k = Math.min(1, t / 0.5)
            const open = k < 0.35 ? k / 0.35 : 1
            const fire = k < 0.35 ? 0 : (k - 0.35) / 0.65
            return {
                body: [0.1 - fire * 0.2, 0, 0],
                neck: [0.5 - fire * 0.3, 0, 0],
                head: [0.2 - fire * 0.4, 0, 0],
                jaw: [-open * 0.7, 0, 0],
                wingLBase: [0, 0, -0.9], wingRBase: [0, 0, 0.9],
                ...allLegs(0.2, 0.3, 0),
            }
        }
    }
    // claw（light / heavy / air）：翼展前扑，抬腿利爪；重击幅度更大
    const amp = segment.key === 'heavy' ? 1.3 : 1
    return (t) => {
        const k = Math.min(1, t / 0.45)
        const rake = Math.sin(k * Math.PI) * amp
        return {
            body: [-0.2 - rake * 0.2, 0, 0],
            neck: [0.3, 0, 0], head: [-0.2, 0, 0],
            jaw: [-Math.min(1, rake) * 0.4, 0, 0],
            wingLBase: [0, 0, -0.9 - rake * 0.4], wingRBase: [0, 0, 0.9 + rake * 0.4],
            lHip: [-rake * 0.9, 0, 0], lKnee: [rake * 0.4, 0, 0], lHock: [0, 0, 0],
            rHip: [-rake * 0.9, 0, 0], rKnee: [rake * 0.4, 0, 0], rHock: [0, 0, 0],
        }
    }
}
