import type {StateHandler} from '../types.ts'
import {
    SWIM_H_DAMPING, SWIM_SPEED_MULTIPLIER, SWIM_KICK_IMPULSE, SWIM_LIFT_SPEED,
    SWIM_EXIT_FLUID, SLOPE_RECOVER_THRESHOLD,
} from '../constants.ts'
import {shouldFall, isSupportedOn} from '../ground.ts'
import {fluidFractionOf} from '../fluid.ts'
import {moveSpeedOf} from '../../types.ts'

/**
 * 游泳（swimming）—— 对应陆地的 walking：有移动输入时浸没于流体中。
 * 水平沿输入方向以 swimSpeed 游动；竖直：镜头俯仰意图（swimLift，玩家）或蹬水冲量（跳跃键），
 * 否则保留竖直速度（AI 与无竖直意图时由浮力决定上浮 / 下潜）。视觉为俯卧（由 world.ts 根姿态合成）。
 */
export const swimmingHandler: StateHandler = {
    enter: () => {},
    update: (_dt, input, entity) => {
        const v = entity.body.linvel()
        const len = Math.hypot(input.dx, input.dz)
        let vx = v.x * SWIM_H_DAMPING
        let vz = v.z * SWIM_H_DAMPING
        if (len > 0.001) {
            const speed = moveSpeedOf(entity) * SWIM_SPEED_MULTIPLIER
            vx = (input.dx / len) * speed
            vz = (input.dz / len) * speed
        }
        let vy = v.y
        if (input.swimLift !== 0) vy = input.swimLift * SWIM_LIFT_SPEED
        else if (input.jump) vy = SWIM_KICK_IMPULSE
        entity.body.setLinvel({x: vx, y: vy, z: vz}, true)
    },
    exit: () => {},
    transitions: [
        {to: 'dying', guard: (_input, entity) => entity.state.combat.health <= 0},
        {to: 'flinching', guard: (_input, entity) => entity.state.combat.pendingFlinch && entity.state.combat.health > 0},
        {
            to: 'floating',
            guard: (input, _entity) => Math.hypot(input.dx, input.dz) <= 0.001 && input.swimLift === 0,
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
