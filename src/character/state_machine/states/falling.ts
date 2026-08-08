import type {StateHandler} from '../types.ts'
import {
    AIR_DAMPING,
    AIR_CONTROL_FACTOR,
    SLOPE_RECOVER_THRESHOLD,
    FALL_MAX_SPEED_MULTIPLIER,
    FALL_SLIDE_MIN_NY,
    STATE_FLIP_MIN_TIME,
} from '../constants.ts'
import {isSupportedOn, projectToSlope} from '../ground.ts'

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
        /* 有支撑面（陡坡）时沿表面滑动（v·n = 0），防止铲地导致接触法线抖动 */
        projectToSlope(entity, entity.body.velocity.x, entity.body.velocity.z, FALL_SLIDE_MIN_NY)
        /* 钳制总速度（含 vy），防止陡坡下滑/坠落无限加速 */
        const maxSpeed = entity.config.speed * FALL_MAX_SPEED_MULTIPLIER
        const speed = entity.body.velocity.length()
        if (speed > maxSpeed) {
            const k = maxSpeed / speed
            entity.body.velocity.scale(k, entity.body.velocity)
        }
        entity.body.wakeUp()
    },
    exit: () => {},
    transitions: [
        {
            to: 'walking',
            guard: (input, entity, ctx) =>
                isSupportedOn(entity, SLOPE_RECOVER_THRESHOLD)
                && Math.hypot(input.dx, input.dz) > 0.001
                && ctx.stateTime >= STATE_FLIP_MIN_TIME,
        },
        {
            to: 'idle',
            guard: (_input, entity, ctx) =>
                isSupportedOn(entity, SLOPE_RECOVER_THRESHOLD)
                && ctx.stateTime >= STATE_FLIP_MIN_TIME,
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
