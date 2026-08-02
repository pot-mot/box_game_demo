import type {StateHandler} from '../types.ts'
import {DASH_SPEED_MULTIPLIER, DASH_DURATION, DASH_COOLDOWN} from '../constants.ts'

/** 进入冲刺时锁定的方向 */
let dashDirX = 0
let dashDirZ = 0

export const dashingHandler: StateHandler = {
    enter: (entity) => {
        const vx = entity.body.velocity.x
        const vz = entity.body.velocity.z
        const vLen = Math.hypot(vx, vz)
        if (vLen > 0.1) {
            dashDirX = vx / vLen
            dashDirZ = vz / vLen
        } else {
            const angle = entity.appearanceGroup.rotation.y
            dashDirX = Math.sin(angle)
            dashDirZ = Math.cos(angle)
        }
        entity.dashCooldownTimer = DASH_COOLDOWN
        entity.body.wakeUp()
    },
    update: (_dt, _input, entity) => {
        const speed = entity.config.speed * DASH_SPEED_MULTIPLIER
        entity.body.velocity.x = dashDirX * speed
        entity.body.velocity.z = dashDirZ * speed
        entity.body.wakeUp()
    },
    exit: () => {},
    transitions: [
        {
            to: 'walking',
            guard: (input, entity, ctx) =>
                ctx.stateTime >= DASH_DURATION
                && Math.hypot(input.dx, input.dz) > 0.001
                && entity.isOnGround,
        },
        {
            to: 'idle',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= DASH_DURATION
                && entity.isOnGround,
        },
        {
            to: 'falling',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= DASH_DURATION
                && !entity.isOnGround,
        },
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
    ],
}
