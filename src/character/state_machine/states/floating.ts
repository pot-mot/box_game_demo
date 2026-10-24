import type {StateHandler} from '../types.ts'
import {SWIM_H_DAMPING, SWIM_EXIT_FLUID, SWIM_KICK_IMPULSE, SLOPE_RECOVER_THRESHOLD} from '../constants.ts'
import {shouldFall, isSupportedOn} from '../ground.ts'
import {fluidFractionOf} from '../fluid.ts'

/**
 * 漂浮（floating）—— 对应陆地的 idle：无移动输入时浸没于流体中。
 * 水平阻尼趋零；**竖直默认不覆写**，保留给浮力场 / 流体拖拽自然积分（上浮 / 下潜 / 悬浮与 AI 一致）；
 * 按跳跃键给一次蹬水上浮冲量。关键：接管流体拖拽造成的「悬空」，避免被误判为 falling。
 */
export const floatingHandler: StateHandler = {
    enter: () => {},
    update: (_dt, input, entity) => {
        const v = entity.body.linvel()
        const vy = input.jump ? SWIM_KICK_IMPULSE : v.y
        entity.body.setLinvel({x: v.x * SWIM_H_DAMPING, y: vy, z: v.z * SWIM_H_DAMPING}, true)
    },
    exit: () => {},
    transitions: [
        {to: 'dying', guard: (_input, entity) => entity.state.combat.health <= 0},
        {to: 'flinching', guard: (_input, entity) => entity.state.combat.pendingFlinch && entity.state.combat.health > 0},
        {
            to: 'swimming',
            guard: (input, _entity) => Math.hypot(input.dx, input.dz) > 0.001 || input.swimLift !== 0,
        },
        {
            to: 'walking',
            guard: (input, entity) =>
                fluidFractionOf(entity) <= SWIM_EXIT_FLUID
                && isSupportedOn(entity, SLOPE_RECOVER_THRESHOLD)
                && Math.hypot(input.dx, input.dz) > 0.001,
        },
        {
            to: 'idle',
            guard: (_input, entity) =>
                fluidFractionOf(entity) <= SWIM_EXIT_FLUID
                && isSupportedOn(entity, SLOPE_RECOVER_THRESHOLD),
        },
        {
            to: 'falling',
            guard: (_input, entity) => fluidFractionOf(entity) <= SWIM_EXIT_FLUID && shouldFall(entity),
        },
    ],
}
