import type {StateHandler} from '../types.ts'
import {GROUND_VY_THRESHOLD} from '../constants.ts'

export const fallingHandler: StateHandler = {
    enter: () => {},
    update: () => {},
    exit: () => {},
    transitions: [
        {
            to: 'walking',
            guard: (input, entity) =>
                Math.abs(entity.body.velocity.y) < GROUND_VY_THRESHOLD
                && Math.hypot(input.dx, input.dz) > 0.001,
        },
        {
            to: 'idle',
            guard: (_, entity) =>
                Math.abs(entity.body.velocity.y) < GROUND_VY_THRESHOLD,
        },
    ],
}
