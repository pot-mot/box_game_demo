import type {StateHandler} from '../types.ts'
import {GROUND_DAMPING} from '../constants.ts'

export const idleHandler: StateHandler = {
    enter: () => {},
    update: (_dt, _input, entity) => {
        entity.body.velocity.x *= GROUND_DAMPING
        entity.body.velocity.z *= GROUND_DAMPING
    },
    exit: () => {},
    transitions: [
        { to: 'walking', guard: (input) => Math.hypot(input.dx, input.dz) > 0.001 },
        {
            to: 'jumping',
            guard: (input, entity) =>
                input.jump && Math.abs(entity.body.velocity.y) < 0.05,
        },
    ],
}
