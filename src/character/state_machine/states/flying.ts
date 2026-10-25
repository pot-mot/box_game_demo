import type {CharacterEntity} from '../../types.ts'
import type {StateHandler} from '../types.ts'
import {
    AIR_CONTROL_FACTOR,
    AIR_DAMPING,
    FLY_SPEED_MULTIPLIER,
    FLY_TAKEOFF_SPEED,
    FLY_TAKEOFF_TIME,
    FLY_VERTICAL_SPEED,
    SLOPE_WALK_THRESHOLD,
    SWIM_ENTER_FLUID,
} from '../constants.ts'
import {isSupportedOn} from '../ground.ts'
import {fluidFractionOf} from '../fluid.ts'
import {moveSpeedOf} from '../../types.ts'
import {isStaminaExhausted} from '../../stamina/runtime.ts'

/** 是否允许进入飞行：角色开关已开启且尚有体力（持续消耗为 0 时也允许） */
export const canEnterFlight = (entity: CharacterEntity): boolean =>
    entity.state.config.flightEnabled === true
    && !isStaminaExhausted(entity.state.stamina)

/**
 * 飞行状态：双击跳跃键切换进入 / 退出；Z / X（`flyLift`）控制升降，水平仍按相机方向移动。
 * 持续消耗体力；体力耗尽、再次切换、主动下降触地或受击 / 死亡时退出。
 */
export const flyingHandler: StateHandler = {
    enter: (entity) => {
        /* 飞行期间关闭重力：悬停时每物理步显式写入竖直速度，
         * 若仍受重力，速度会被 step 后的重新赋值抹平，但位置已下沉（约 0.16m/s） */
        entity.body.setGravityScale(0, true)
        const linvel = entity.body.linvel()
        entity.body.setLinvel({x: linvel.x, y: FLY_TAKEOFF_SPEED, z: linvel.z}, true)
        entity.body.wakeUp()
    },
    update: (_dt, input, entity, ctx) => {
        const len = Math.hypot(input.dx, input.dz)
        const linvel = entity.body.linvel()
        let vx = linvel.x * AIR_DAMPING
        let vz = linvel.z * AIR_DAMPING
        if (len > 0.001) {
            const speed = moveSpeedOf(entity) * FLY_SPEED_MULTIPLIER
            const tx = (input.dx / len) * speed
            const tz = (input.dz / len) * speed
            vx = linvel.x + (tx - linvel.x) * AIR_CONTROL_FACTOR
            vz = linvel.z + (tz - linvel.z) * AIR_CONTROL_FACTOR
        }
        /* 起飞阶段仅在未主动下降时补足上升速度；按住 X 可立即下沉 */
        const takeoff = ctx.stateTime < FLY_TAKEOFF_TIME && input.flyLift >= 0
        const vy = takeoff
            ? Math.max(FLY_TAKEOFF_SPEED, input.flyLift * FLY_VERTICAL_SPEED)
            : input.flyLift * FLY_VERTICAL_SPEED
        entity.body.setLinvel({x: vx, y: vy, z: vz}, true)
    },
    exit: (entity) => {
        entity.body.setGravityScale(1, true)
    },
    transitions: [
        {
            to: 'swimming',
            guard: (input, entity) => fluidFractionOf(entity) >= SWIM_ENTER_FLUID && Math.hypot(input.dx, input.dz) > 0.001,
        },
        {
            to: 'floating',
            guard: (_input, entity) => fluidFractionOf(entity) >= SWIM_ENTER_FLUID,
        },
        {
            to: 'dying',
            guard: (_input, entity) => entity.state.combat.health <= 0,
        },
        {
            to: 'flinching',
            guard: (_input, entity) => entity.state.combat.pendingFlinch && entity.state.combat.health > 0,
        },
        {
            to: 'walking',
            guard: (input, entity, ctx) =>
                isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
                && (input.fly || input.flyLift < 0 || isStaminaExhausted(entity.state.stamina))
                && (input.fly || ctx.stateTime >= FLY_TAKEOFF_TIME || isStaminaExhausted(entity.state.stamina))
                && Math.hypot(input.dx, input.dz) > 0.001,
        },
        {
            to: 'idle',
            guard: (input, entity, ctx) =>
                isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
                && (input.fly || input.flyLift < 0 || isStaminaExhausted(entity.state.stamina))
                && (input.fly || ctx.stateTime >= FLY_TAKEOFF_TIME || isStaminaExhausted(entity.state.stamina)),
        },
        {
            to: 'falling',
            guard: (input, entity) =>
                input.fly
                || isStaminaExhausted(entity.state.stamina)
                || entity.state.config.flightEnabled !== true,
        },
    ],
}
