import type {StateHandler} from '../types.ts'
import {GROUND_DAMPING} from '../constants.ts'

export const idleHandler: StateHandler = {
    enter: () => {},
    update: (_dt, _input, entity) => {
        entity.body.velocity.x *= GROUND_DAMPING
        entity.body.velocity.z *= GROUND_DAMPING
        entity.body.wakeUp()
    },
    exit: () => {},
    transitions: [
        { to: 'walking', guard: (input) => Math.hypot(input.dx, input.dz) > 0.001 },
        {
            to: 'attacking',
            guard: (input, entity) => {
                const skill = entity.combat.skills[input.skillIndex]
                return input.attack && (skill?.cooldownTimer ?? Infinity) <= 0
            },
        },
        {
            to: 'jumping',
            guard: (input, entity) =>
                input.jump && entity.isOnGround,
        },
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
    ],
}
