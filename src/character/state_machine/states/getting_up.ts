import type {StateHandler} from '../types.ts'
import {SLOPE_WALK_THRESHOLD} from '../constants.ts'
import {shouldFall, isSupportedOn} from '../ground.ts'

/**
 * 起身状态：倒地时长结束后进入。期间保持完全免疫（`hitImmunityTimer` 覆盖全程），
 * 根旋转由 `world.ts` 按 `knockdownFallAngle` 从 π/2 缓动回 0；起身结束后解除免疫并回满韧性。
 */
export const gettingUpHandler: StateHandler = {
    enter: (entity) => {
        /* 仅清水平速度：保留垂直方向，空中被击倒后起身期间仍受重力下落 */
        entity.body.setLinvel({x: 0, y: entity.body.linvel().y, z: 0}, true)
    },
    update: (_dt, _input, entity, ctx) => {
        void _dt, _input
        entity.body.setLinvel({x: 0, y: entity.body.linvel().y, z: 0}, true)
        const p = Math.min(Math.max(ctx.stateTime / Math.max(entity.combat.getUpDuration, 0.0001), 0), 1)
        entity.knockdownFallAngle = Math.PI / 2 * (1 - p)
    },
    exit: (entity) => {
        /* 起身结束：解除完全免疫并回满韧性 */
        entity.combat.hitImmunityTimer = 0
        entity.combat.poise = entity.combat.poiseMax
        entity.knockdownFallAngle = 0
    },
    transitions: [
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
        {
            to: 'walking',
            guard: (input, entity, ctx) =>
                ctx.stateTime >= entity.combat.getUpDuration
                && Math.hypot(input.dx, input.dz) > 0.001
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'idle',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= entity.combat.getUpDuration
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'falling',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= entity.combat.getUpDuration
                && shouldFall(entity),
        },
    ],
}
