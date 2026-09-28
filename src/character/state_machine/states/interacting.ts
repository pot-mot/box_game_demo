import type {StateHandler} from '../types.ts'
import {GROUND_DAMPING, SLOPE_WALK_THRESHOLD, STATE_FLIP_MIN_TIME} from '../constants.ts'
import {shouldFall, isSupportedOn} from '../ground.ts'
import {INTERACTION_DURATION} from '../../interaction/types.ts'

/**
 * 交互状态：站定执行一次交互动作（伸手 → 发力），时长 `INTERACTION_DURATION`。
 * 效果由 play 侧的交互编排在动作进度 `INTERACTION_ACTIVATE_TIME` 时触发；
 * 本状态只负责站定与动画驻留，受击 / 死亡可打断。
 */
export const interactingHandler: StateHandler = {
    enter: (entity) => {
        /* 交互时站定：清除水平速度（保留竖直分量，避免打断下落） */
        const linvel = entity.body.linvel()
        entity.body.setLinvel({x: 0, y: linvel.y, z: 0}, true)
    },
    update: (_dt, _input, entity) => {
        /* 外力推动（斜坡 / 碰撞）时持续减速，保持站定 */
        const linvel = entity.body.linvel()
        entity.body.setLinvel({x: linvel.x * GROUND_DAMPING, y: linvel.y, z: linvel.z * GROUND_DAMPING}, true)
    },
    exit: () => {},
    transitions: [
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
        {
            to: 'flinching',
            guard: (_input, entity) => entity.combat.pendingFlinch && entity.combat.health > 0,
        },
        {
            to: 'walking',
            guard: (input, entity, ctx) =>
                ctx.stateTime >= INTERACTION_DURATION
                && Math.hypot(input.dx, input.dz) > 0.001
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'idle',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= INTERACTION_DURATION
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'falling',
            guard: (_input, entity, ctx) =>
                ctx.stateTime >= INTERACTION_DURATION
                && shouldFall(entity)
                && entity.airborneTime >= STATE_FLIP_MIN_TIME,
        },
    ],
}
