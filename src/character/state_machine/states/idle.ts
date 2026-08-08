import type {StateHandler} from '../types.ts'
import {GROUND_DAMPING, SLOPE_WALK_THRESHOLD, STATE_FLIP_MIN_TIME} from '../constants.ts'
import {shouldFall, isSupportedOn, projectToSlope, applySlopeAntiGravity} from '../ground.ts'

export const idleHandler: StateHandler = {
    enter: () => {},
    update: (_dt, _input, entity) => {
        const vx = entity.body.velocity.x * GROUND_DAMPING
        const vz = entity.body.velocity.z * GROUND_DAMPING
        /* 斜坡防滑：可站立坡面上速度清零并沿坡投影 + 反力抵消重力沿坡分量，防止自然下滑 */
        if (!projectToSlope(entity, 0, 0, SLOPE_WALK_THRESHOLD)) {
            entity.body.velocity.x = vx
            entity.body.velocity.z = vz
        } else {
            applySlopeAntiGravity(entity)
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
                input.jump && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
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
            to: 'falling',
            guard: (_input, entity) =>
                shouldFall(entity) && entity.airborneTime >= STATE_FLIP_MIN_TIME,
        },
    ],
}
