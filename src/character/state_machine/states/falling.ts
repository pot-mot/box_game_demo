import type {StateHandler} from '../types.ts'
import {AIR_DAMPING, AIR_CONTROL_FACTOR} from '../constants.ts'

export const fallingHandler: StateHandler = {
    enter: () => {},
    update: (_dt, input, entity) => {
        const len = Math.hypot(input.dx, input.dz)
        const vx = entity.body.velocity.x
        const vz = entity.body.velocity.z
        if (len < 0.001) {
            entity.body.velocity.x = vx * AIR_DAMPING
            entity.body.velocity.z = vz * AIR_DAMPING
        } else {
            const tx = (input.dx / len) * entity.config.speed
            const tz = (input.dz / len) * entity.config.speed
            entity.body.velocity.x = vx + (tx - vx) * AIR_CONTROL_FACTOR
            entity.body.velocity.z = vz + (tz - vz) * AIR_CONTROL_FACTOR
        }
        entity.body.wakeUp()
    },
    exit: () => {},
    transitions: [
        {
            to: 'walking',
            guard: (input, entity) =>
                entity.isOnGround
                && Math.hypot(input.dx, input.dz) > 0.001,
        },
        {
            to: 'idle',
            guard: (_, entity) =>
                entity.isOnGround,
        },
        {
            to: 'dashing',
            guard: (input, entity) => input.sprint && entity.dashCooldownTimer <= 0,
        },
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
    ],
}
