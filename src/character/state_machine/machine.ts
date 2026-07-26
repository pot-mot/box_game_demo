import type {CharacterEntity} from '../types.ts'
import type {
    CharacterState,
    CharacterInput,
    CharacterStateMachine,
    MachineContext,
    StateHandler,
} from './types.ts'
import {idleHandler} from './states/idle.ts'
import {walkingHandler} from './states/walking.ts'
import {jumpingHandler} from './states/jumping.ts'
import {fallingHandler} from './states/falling.ts'

const STATE_HANDLERS: Record<CharacterState, StateHandler> = {
    idle: idleHandler,
    walking: walkingHandler,
    jumping: jumpingHandler,
    falling: fallingHandler,
}

export const createCharacterStateMachine = (): CharacterStateMachine => {
    let currentState: CharacterState = 'idle'
    let previousState: CharacterState | null = null
    let stateTime = 0
    let onStateChange: ((from: CharacterState, to: CharacterState) => void) | null = null
    const input: CharacterInput = {dx: 0, dz: 0, jump: false}

    const makeContext = (): MachineContext => ({
        stateTime,
        previousState,
    })

    const setInput = (dx: number, dz: number, jump: boolean): void => {
        input.dx = dx
        input.dz = dz
        input.jump = jump
    }

    const update = (dt: number, entity: CharacterEntity): void => {
        const handler = STATE_HANDLERS[currentState]
        const ctx = makeContext()

        for (const t of handler.transitions) {
            if (t.guard(input, entity)) {
                handler.exit(entity, ctx)
                previousState = currentState
                currentState = t.to
                stateTime = 0
                const newCtx = makeContext()
                STATE_HANDLERS[currentState].enter(entity, newCtx)
                onStateChange?.(previousState, currentState)
                return
            }
        }

        stateTime += dt
        STATE_HANDLERS[currentState].update(dt, input, entity, makeContext())
    }

    const reset = (): void => {
        currentState = 'idle'
        previousState = null
        stateTime = 0
        input.dx = 0
        input.dz = 0
        input.jump = false
    }

    return {
        get currentState() { return currentState },
        get previousState() { return previousState },
        get stateTime() { return stateTime },
        get onStateChange() { return onStateChange },
        set onStateChange(v) { onStateChange = v },
        setInput,
        update,
        reset,
    }
}
