import type {StateHandler} from '../types.ts'
import type {CharacterEntity} from '../../types.ts'
import {SLOPE_WALK_THRESHOLD, STATE_FLIP_MIN_TIME} from '../constants.ts'
import {shouldFall, isSupportedOn} from '../ground.ts'
import {guardMaxOf} from '../../combat/types.ts'
import {FALLBACK_GUARD_BREAK_DURATION} from '../../combat/constants.ts'

/**
 * 破防状态：格挡槽归零（`machine.ts` 全局检查）时进入，持续盾的 `guardBreakDuration`。
 * 期间举盾被强制解除、原地硬直不可移动攻击；结束后格挡槽回满并回到待机 / 行走。
 */
export const guardBrokenHandler: StateHandler = {
    enter: (entity) => {
        entity.state.combat.blocking = false
        entity.state.combat.blockHeld = false
        entity.body.setLinvel({x: 0, y: 0, z: 0}, true)
    },
    update: (_dt, _input, entity) => {
        /* 破防硬直：锁死水平位移，仅保留垂直方向（受重力 / 地形） */
        entity.body.setLinvel({x: 0, y: entity.body.linvel().y, z: 0}, true)
    },
    exit: (entity) => {
        entity.state.combat.guard = guardMaxOf(entity.state.combat)
    },
    transitions: [
        {
            to: 'dying',
            guard: (_input, entity) => entity.state.combat.health <= 0,
        },
        {
            to: 'walking',
            guard: (input, entity, ctx) =>
                ctx.stateTime >= guardBreakDurationOf(entity)
                && Math.hypot(input.dx, input.dz) > 0.001
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'idle',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= guardBreakDurationOf(entity)
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'falling',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= guardBreakDurationOf(entity)
                && shouldFall(entity)
                && entity.state.physics.airborneTime >= STATE_FLIP_MIN_TIME,
        },
    ],
}

const guardBreakDurationOf = (entity: CharacterEntity): number =>
    entity.state.combat.block?.guardBreakDuration ?? FALLBACK_GUARD_BREAK_DURATION
