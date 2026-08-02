import type {StateHandler} from '../types.ts'

export const walkingHandler: StateHandler = {
    enter: (entity) => {
        entity.body.wakeUp()
    },
    update: (_dt, input, entity) => {
        const len = Math.hypot(input.dx, input.dz)
        if (len < 0.001) return
        const speed = entity.config.speed
        const vx = (input.dx / len) * speed
        const vz = (input.dz / len) * speed
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
        { to: 'idle', guard: (input) => Math.hypot(input.dx, input.dz) < 0.001 },
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
