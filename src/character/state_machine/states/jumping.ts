import type {StateHandler} from '../types.ts'

export const jumpingHandler: StateHandler = {
    enter: (entity) => {
        entity.body.velocity.y = Math.sqrt(2 * 9.82 * entity.config.jumpHeight)
        entity.body.wakeUp()
    },
    update: () => {},
    exit: () => {},
    transitions: [
        {
            to: 'falling',
            guard: (_, entity) =>
                entity.body.velocity.y <= 0 && Math.abs(entity.body.velocity.y) >= 0.05,
        },
    ],
}
