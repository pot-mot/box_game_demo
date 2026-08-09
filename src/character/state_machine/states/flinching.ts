import type {StateHandler} from '../types.ts'
import {SLOPE_WALK_THRESHOLD} from '../constants.ts'
import {shouldFall, isSupportedOn} from '../ground.ts'
import {FLINCH_DURATION} from '../../combat/attack_phases.ts'

export const flinchingHandler: StateHandler = {
    enter: (entity) => {
        const c = entity.combat
        c.attackActive = false
        c.pendingFlinch = false
        c.comboIndex = 0
        c.phaseIndex = 0
        c.phaseTimer = 0
        entity.body.velocity.set(0, 0, 0)
        entity.body.wakeUp()
    },
    update: (_dt, _input, entity) => {
        void _dt, _input
        entity.body.velocity.set(0, 0, 0)
        entity.body.wakeUp()
    },
    exit: () => {},
    transitions: [
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
        {
            to: 'walking',
            guard: (input, entity, ctx) =>
                ctx.stateTime >= FLINCH_DURATION
                && Math.hypot(input.dx, input.dz) > 0.001
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'idle',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= FLINCH_DURATION
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'jumping',
            guard: (input, entity, ctx) =>
                ctx.stateTime >= FLINCH_DURATION
                && input.jump
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'falling',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= FLINCH_DURATION
                && shouldFall(entity),
        },
    ],
}