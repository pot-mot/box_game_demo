import type {StateHandler} from '../types.ts'

export const attackingHandler: StateHandler = {
    enter: (entity) => {
        entity.attackActive = true
        entity.attackTimer = 0
        entity.attackedTargets.clear()
        entity.body.wakeUp()
    },
    update: (dt, _input, entity) => {
        entity.attackTimer += dt
        entity.body.velocity.x *= 0.3
        entity.body.velocity.z *= 0.3
        entity.body.wakeUp()
    },
    exit: (entity) => {
        entity.attackActive = false
        entity.attackCooldownTimer = entity.attackSlot.cooldown
    },
    transitions: [
        {
            to: 'walking',
            guard: (input, entity) =>
                entity.attackTimer >= entity.attackSlot.duration
                && Math.hypot(input.dx, input.dz) > 0.001
                && entity.isOnGround,
        },
        {
            to: 'idle',
            guard: (_input, entity) =>
                entity.attackTimer >= entity.attackSlot.duration
                && entity.isOnGround,
        },
        {
            to: 'jumping',
            guard: (input, entity) =>
                entity.attackTimer >= entity.attackSlot.duration
                && input.jump
                && entity.isOnGround,
        },
        {
            to: 'falling',
            guard: (_input, entity) =>
                entity.attackTimer >= entity.attackSlot.duration
                && !entity.isOnGround,
        },
        {
            to: 'dying',
            guard: (_input, entity) => entity.health <= 0,
        },
    ],
}
