import type {StateHandler} from '../types.ts'
import {SLOPE_WALK_THRESHOLD, STATE_FLIP_MIN_TIME} from '../constants.ts'
import {shouldFall, isSupportedOn, projectToSlopeAtSpeed, applySlopeSink} from '../ground.ts'

export const walkingHandler: StateHandler = {
    enter: (entity) => {
        entity.body.wakeUp()
    },
    update: (_dt, input, entity) => {
        const len = Math.hypot(input.dx, input.dz)
        if (len < 0.001) return
        const speed = entity.config.speed
        const dx = input.dx / len
        const dz = input.dz / len
        if (!projectToSlopeAtSpeed(entity, dx, dz, speed, SLOPE_WALK_THRESHOLD)) {
            entity.body.velocity.x = dx * speed
            entity.body.velocity.z = dz * speed
        } else {
            /* 弹跳悬空（宽限期）时向坡面吸附，快速落回 */
            applySlopeSink(entity)
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
