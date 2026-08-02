import type {StateHandler} from '../types.ts'
import {GROUND_DAMPING} from '../constants.ts'

export const idleHandler: StateHandler = {
    enter: () => {},
    update: (_dt, _input, entity) => {
        const vx = entity.body.velocity.x * GROUND_DAMPING
        const vz = entity.body.velocity.z * GROUND_DAMPING
        if (entity.isOnGround && entity.groundNormal.y > 0.001) {
            const n = entity.groundNormal
            entity.body.velocity.x = vx
            entity.body.velocity.y = -(vx * n.x + vz * n.z) / n.y
            entity.body.velocity.z = vz
        } else {
            entity.body.velocity.x = vx
            entity.body.velocity.z = vz
        }
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
            to: 'dashing',
            guard: (input, entity) => input.sprint && entity.dashCooldownTimer <= 0,
        },
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
    ],
}
