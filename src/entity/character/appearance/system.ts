import type {CharacterState} from '../../../character/state_machine/types.ts'
import type {CharacterModel, AnimationHandler, AnimationContext} from './types.ts'
import {idleAnim} from './animators/idle.ts'
import {walkingAnim} from './animators/walking.ts'
import {jumpingAnim} from './animators/jumping.ts'
import {fallingAnim} from './animators/falling.ts'
import {attackingAnim} from './animators/attacking.ts'
import {dyingAnim} from './animators/dying.ts'
import {dashingAnim} from './animators/dashing.ts'
import {HORIZONTAL_SPEED_SMOOTHING} from './constants.ts'

const ANIMATION_HANDLERS: Record<CharacterState, AnimationHandler> = {
    idle: idleAnim,
    walking: walkingAnim,
    jumping: jumpingAnim,
    falling: fallingAnim,
    attacking: attackingAnim,
    dying: dyingAnim,
    dashing: dashingAnim,
}

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

    const onStateChange = (from: CharacterState | null, to: CharacterState, model: CharacterModel): void => {
        if (from && currentModel === model) {
            const prevHandler = ANIMATION_HANDLERS[from]
            prevHandler.exit(model, {stateTime: 0, horizontalSpeed: 0, horizontalTravel: 0, swingTilt: 0})
        }
        currentState = to
        currentModel = model
        const handler = ANIMATION_HANDLERS[to]
        handler.enter(model, {stateTime: 0, horizontalSpeed: 0, horizontalTravel: 0, swingTilt: 0})
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
    }

    return {onStateChange, update}
}
