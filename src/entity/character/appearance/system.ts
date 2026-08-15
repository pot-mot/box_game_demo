import type {CharacterState} from '../../../character/state_machine/types.ts'
import type {Group} from 'three'
import type {CharacterModel, AnimationHandler, AnimationContext} from './types.ts'
import {idleAnim} from './animators/idle.ts'
import {walkingAnim} from './animators/walking.ts'
import {jumpingAnim} from './animators/jumping.ts'
import {fallingAnim} from './animators/falling.ts'
import {attackingAnim} from './animators/attacking.ts'
import {flinchingAnim} from './animators/flinching.ts'
import {dyingAnim} from './animators/dying.ts'
import {dashingAnim} from './animators/dashing.ts'
import {HORIZONTAL_SPEED_SMOOTHING, STATE_BLEND_DURATION} from './constants.ts'

const ANIMATION_HANDLERS: Record<CharacterState, AnimationHandler> = {
    idle: idleAnim,
    walking: walkingAnim,
    jumping: jumpingAnim,
    falling: fallingAnim,
    attacking: attackingAnim,
    dying: dyingAnim,
    dashing: dashingAnim,
    flinching: flinchingAnim,
}

/** 参与过渡混合的关节快照（旋转 + 位置，位置仅 spine 使用） */
interface JointSnapshot {
    readonly joint: Group
    readonly rx: number
    readonly ry: number
    readonly rz: number
    readonly px: number
    readonly py: number
    readonly pz: number
}

/** 收集模型全部可动画关节（顺序固定，快照与回写一一对应） */
const snapshotJoints = (model: CharacterModel): JointSnapshot[] => [
    model.rightArmShoulder, model.rightArmElbow, model.rightWristPivot,
    model.leftArmShoulder, model.leftArmElbow,
    model.rightLegHip, model.rightLegKnee, model.leftLegHip, model.leftLegKnee,
    model.headNeck, model.spine,
].map(joint => ({
    joint,
    rx: joint.rotation.x, ry: joint.rotation.y, rz: joint.rotation.z,
    px: joint.position.x, py: joint.position.y, pz: joint.position.z,
}))

export interface AppearanceSystem {
    onStateChange: (from: CharacterState | null, to: CharacterState, model: CharacterModel) => void
    update: (dt: number, model: CharacterModel, state: CharacterState, ctx: AnimationContext) => void
}

export const createAppearanceSystem = (): AppearanceSystem => {
    let currentState: CharacterState | null = null
    let currentModel: CharacterModel | null = null
    /* 水平速度 EMA 平滑：coyote 吸附/弹跳导致的速度突变不直接传导到动画频率 */
    let smoothedSpeed = 0
    /* 累计水平位移（平滑速度积分）：单调递增，供位移驱动动画使用（相位永不回退） */
    let travel = 0
    /* 状态切换瞬间的关节快照：新状态动画输出向快照混合，消除关节角突跳 */
    let blendFrom: readonly JointSnapshot[] | null = null
    let blendT = 0

    const onStateChange = (from: CharacterState | null, to: CharacterState, model: CharacterModel): void => {
        const placeholderCtx = {stateTime: 0, horizontalSpeed: 0, horizontalTravel: 0, swingTilt: 0, attackPhase: undefined, attackPhaseProgress: 0, attackTotalProgress: 0, attackPhases: undefined, attackPhaseIndex: 0, weaponHeld: false}
        /* 在旧状态 exit 归零之前抓取当前关节姿态，作为混合起点 */
        if (from && currentModel === model) {
            blendFrom = snapshotJoints(model)
            blendT = 0
            const prevHandler = ANIMATION_HANDLERS[from]
            prevHandler.exit(model, placeholderCtx)
        } else {
            blendFrom = null
        }
        currentState = to
        currentModel = model
        const handler = ANIMATION_HANDLERS[to]
        handler.enter(model, placeholderCtx)
    }

    const update = (dt: number, model: CharacterModel, state: CharacterState, ctx: AnimationContext): void => {
        if (state !== currentState || model !== currentModel) {
            onStateChange(currentState, state, model)
            /* 状态切换时对齐新状态初值，避免旧状态速度平滑残留 */
            smoothedSpeed = ctx.horizontalSpeed
            travel = 0
        }
        smoothedSpeed += (ctx.horizontalSpeed - smoothedSpeed) * HORIZONTAL_SPEED_SMOOTHING
        travel += smoothedSpeed * dt
        const handler = ANIMATION_HANDLERS[state]
        handler.update(dt, model, {...ctx, horizontalSpeed: smoothedSpeed, horizontalTravel: travel})

        /* 状态过渡混合：动画器输出向切换前快照按剩余时间收敛（三次 ease-out） */
        if (blendFrom && blendT < STATE_BLEND_DURATION) {
            blendT += dt
            const k = 1 - Math.pow(1 - Math.min(blendT / STATE_BLEND_DURATION, 1), 3)
            for (const snap of blendFrom) {
                const j = snap.joint
                j.rotation.x = snap.rx + (j.rotation.x - snap.rx) * k
                j.rotation.y = snap.ry + (j.rotation.y - snap.ry) * k
                j.rotation.z = snap.rz + (j.rotation.z - snap.rz) * k
                j.position.x = snap.px + (j.position.x - snap.px) * k
                j.position.y = snap.py + (j.position.y - snap.py) * k
                j.position.z = snap.pz + (j.position.z - snap.pz) * k
            }
            if (blendT >= STATE_BLEND_DURATION) blendFrom = null
        }
    }

    return {onStateChange, update}
}
