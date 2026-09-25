import type {StateHandler} from '../types.ts'
import {SLOPE_WALK_THRESHOLD} from '../constants.ts'
import {shouldFall, isSupportedOn} from '../ground.ts'
import {FLINCH_DURATION, FLINCH_IMMUNITY_DURATION} from '../../combat/attack_phases.ts'

export const flinchingHandler: StateHandler = {
    enter: (entity) => {
        const c = entity.combat
        c.attackActive = false
        c.pendingFlinch = false
        c.bufferedSegment = undefined
        c.phaseIndex = 0
        c.phaseTimer = 0
        entity.body.setLinvel({x: 0, y: 0, z: 0}, true)
    },
    update: (_dt, _input, entity) => {
        void _dt, _input
        entity.body.setLinvel({x: 0, y: 0, z: 0}, true)
    },
    exit: (entity) => {
        /* 硬直结束后挂免硬直窗口：防止无限连段把目标永久锁在受击状态（伤害照常结算） */
        entity.combat.flinchImmunityTimer = FLINCH_IMMUNITY_DURATION
    },
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
