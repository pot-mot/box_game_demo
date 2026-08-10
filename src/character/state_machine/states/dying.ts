import type {StateHandler} from '../types.ts'

export const DYING_DURATION = 0.6

export const dyingHandler: StateHandler = {
    enter: (entity) => {
        entity.combat.attackActive = false
        entity.body.setLinvel({x: 0, y: 0, z: 0}, true)
    },
    update: (dt, _input, entity) => {
        entity.body.setLinvel({x: 0, y: 0, z: 0}, true)
        if (!entity.isDying) {
            entity.isDying = true
            entity.dyingTimer = 0
        }
        entity.dyingTimer = (entity.dyingTimer ?? 0) + dt
        if (entity.dyingTimer >= DYING_DURATION) {
            entity.combat.isDead = true
        }
    },
    exit: () => {},
    transitions: [],
}
