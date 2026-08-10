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
import {v3Length} from '../../../physics/rapier_utils.ts'

export const fallingHandler: StateHandler = {
    enter: () => {},
    update: (_dt, input, entity) => {
        const len = Math.hypot(input.dx, input.dz)
        const linvel = entity.body.linvel()
        const vx = linvel.x
        const vz = linvel.z
        let newVx: number
        let newVz: number
        if (len < 0.001) {
            newVx = vx * AIR_DAMPING
            newVz = vz * AIR_DAMPING
        } else {
            const tx = (input.dx / len) * entity.config.speed
            const tz = (input.dz / len) * entity.config.speed
            newVx = vx + (tx - vx) * AIR_CONTROL_FACTOR
            newVz = vz + (tz - vz) * AIR_CONTROL_FACTOR
        }
        entity.body.setLinvel({x: newVx, y: linvel.y, z: newVz}, true)
        /* 有支撑面（陡坡）时沿表面滑动（v·n = 0），防止铲地导致接触法线抖动 */
        projectToSlope(entity, newVx, newVz, FALL_SLIDE_MIN_NY)
        /* 钳制总速度（含 vy），防止陡坡下滑/坠落无限加速 */
        const maxSpeed = entity.config.speed * FALL_MAX_SPEED_MULTIPLIER
        const finalLinvel = entity.body.linvel()
        const speed = v3Length(finalLinvel)
        if (speed > maxSpeed) {
            const k = maxSpeed / speed
            entity.body.setLinvel({x: finalLinvel.x * k, y: finalLinvel.y * k, z: finalLinvel.z * k}, true)
        }
    },
    exit: () => {},
    transitions: [
        {
            to: 'walking',
            guard: (input, entity) =>
                isSupportedOn(entity, SLOPE_RECOVER_THRESHOLD)
                && Math.hypot(input.dx, input.dz) > 0.001
                && entity.groundedTime >= STATE_FLIP_MIN_TIME,
        },
        {
            to: 'idle',
            guard: (_input, entity) =>
                isSupportedOn(entity, SLOPE_RECOVER_THRESHOLD)
                && entity.groundedTime >= STATE_FLIP_MIN_TIME,
        },
        {
            to: 'dashing',
            guard: (input, entity) => input.sprint && entity.dashCooldownTimer <= 0,
        },
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
        {
            to: 'flinching',
            guard: (_input, entity) => entity.combat.pendingFlinch && entity.combat.health > 0,
        },
    ],
}
