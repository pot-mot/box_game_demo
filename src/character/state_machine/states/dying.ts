import type {StateHandler} from '../types.ts'

export const dyingHandler: StateHandler = {
    enter: (entity) => {
        entity.isDead = true
        entity.attackActive = false
        entity.body.velocity.set(0, 0, 0)
        entity.body.wakeUp()
    },
    update: (_dt, _input, entity) => {
        entity.body.velocity.set(0, 0, 0)
    },
    exit: () => {},
    transitions: [],
}
