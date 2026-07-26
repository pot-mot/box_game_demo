import type {StateHandler} from '../types.ts'

export const walkingHandler: StateHandler = {
    enter: (entity) => {
        entity.body.wakeUp()
    },
    update: (_dt, input, entity) => {
        const len = Math.hypot(input.dx, input.dz)
        if (len < 0.001) return
        entity.body.velocity.x = (input.dx / len) * entity.config.speed
        entity.body.velocity.z = (input.dz / len) * entity.config.speed
        entity.body.wakeUp()
    },
    exit: () => {},
    transitions: [
        { to: 'idle', guard: (input) => Math.hypot(input.dx, input.dz) < 0.001 },
        {
            to: 'jumping',
            guard: (input, entity) =>
                input.jump && entity.isOnGround,
        },
    ],
}
