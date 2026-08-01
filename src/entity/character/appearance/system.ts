import type {CharacterState} from '../../../character/state_machine/types.ts'
import type {CharacterModel, AnimationHandler, AnimationContext} from './types.ts'
import {idleAnim} from './animators/idle.ts'
import {walkingAnim} from './animators/walking.ts'
import {jumpingAnim} from './animators/jumping.ts'
import {fallingAnim} from './animators/falling.ts'
import {attackingAnim} from './animators/attacking.ts'
import {dyingAnim} from './animators/dying.ts'

const ANIMATION_HANDLERS: Record<CharacterState, AnimationHandler> = {
    idle: idleAnim,
    walking: walkingAnim,
    jumping: jumpingAnim,
    falling: fallingAnim,
    attacking: attackingAnim,
    dying: dyingAnim,
}

export interface AppearanceSystem {
    onStateChange: (from: CharacterState | null, to: CharacterState, model: CharacterModel) => void
    update: (dt: number, model: CharacterModel, state: CharacterState, ctx: AnimationContext) => void
}

export const createAppearanceSystem = (): AppearanceSystem => {
    let currentState: CharacterState | null = null
    let currentModel: CharacterModel | null = null

    const onStateChange = (from: CharacterState | null, to: CharacterState, model: CharacterModel): void => {
        if (from && currentModel === model) {
            const prevHandler = ANIMATION_HANDLERS[from]
            prevHandler.exit(model, {stateTime: 0, horizontalSpeed: 0})
        }
        currentState = to
        currentModel = model
        const handler = ANIMATION_HANDLERS[to]
        handler.enter(model, {stateTime: 0, horizontalSpeed: 0})
    }

    const update = (dt: number, model: CharacterModel, state: CharacterState, ctx: AnimationContext): void => {
        if (state !== currentState || model !== currentModel) {
            onStateChange(currentState, state, model)
        }
        const handler = ANIMATION_HANDLERS[state]
        handler.update(dt, model, ctx)
    }

    return {onStateChange, update}
}
