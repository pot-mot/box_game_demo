import type {StateHandler} from '../types.ts'
import {AIR_DAMPING, AIR_CONTROL_FACTOR, SLOPE_WALK_THRESHOLD, JUMP_LAND_MIN_TIME, SWIM_ENTER_FLUID} from '../constants.ts'
import {shouldFall, isSupportedOn} from '../ground.ts'
import {fluidFractionOf} from '../fluid.ts'
import {moveSpeedOf} from '../../types.ts'
import {canStartAirAttack} from './air_attacking.ts'

export const jumpingHandler: StateHandler = {
    enter: (entity) => {
        const linvel = entity.body.linvel()
        entity.body.setLinvel({x: linvel.x, y: Math.sqrt(2 * 9.82 * entity.state.config.jumpHeight), z: linvel.z}, true)
    },
    update: (_dt, input, entity) => {
        const len = Math.hypot(input.dx, input.dz)
        const linvel = entity.body.linvel()
        const vx = linvel.x
        const vz = linvel.z
        if (len < 0.001) {
            entity.body.setLinvel({x: vx * AIR_DAMPING, y: linvel.y, z: vz * AIR_DAMPING}, true)
        } else {
            const speed = moveSpeedOf(entity)
            const tx = (input.dx / len) * speed
            const tz = (input.dz / len) * speed
            entity.body.setLinvel({x: vx + (tx - vx) * AIR_CONTROL_FACTOR, y: linvel.y, z: vz + (tz - vz) * AIR_CONTROL_FACTOR}, true)
        }
    },
    exit: () => {},
    transitions: [
        {
            /* 入水：浸没时切换游泳 / 漂浮 */
            to: 'swimming',
            guard: (input, entity) => fluidFractionOf(entity) >= SWIM_ENTER_FLUID && Math.hypot(input.dx, input.dz) > 0.001,
        },
        {
            to: 'floating',
            guard: (_input, entity) => fluidFractionOf(entity) >= SWIM_ENTER_FLUID,
        },
        {
            to: 'falling',
            guard: (_, entity) => {
                const vy = entity.body.linvel().y
                return vy <= 0 && Math.abs(vy) >= 0.05
            },
        },
        {
            /* 落地恢复支撑（下降段）→ 恢复行走：
             * Rapier 接触结算后静止 vy≈0（|vy| < 0.05 无法触发上面的 falling 守卫），
             * 必须显式检测支撑面，否则角色会永远卡在 jumping */
            to: 'walking',
            guard: (input, entity, ctx) => {
                const vy = entity.body.linvel().y
                return vy <= 0
                    && ctx.stateTime >= JUMP_LAND_MIN_TIME
                    && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
                    && Math.hypot(input.dx, input.dz) > 0.001
            },
        },
        {
            /* 落地恢复支撑（下降段）→ 待机 */
            to: 'idle',
            guard: (_input, entity, ctx) => {
                const vy = entity.body.linvel().y
                return vy <= 0
                    && ctx.stateTime >= JUMP_LAND_MIN_TIME
                    && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
            },
        },
        {
            to: 'falling',
            /* 上升段（vy > 0）保持 jumping，不因支撑判定提前切换 */
            guard: (_input, entity) => shouldFall(entity) && entity.body.linvel().y <= 0,
        },
        {
            to: 'rolling',
            guard: (input, entity) => input.roll && entity.state.combat.rollSkill.cooldownTimer <= 0,
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
            /* 空中攻击：跳跃中按攻击键且武器声明了空中链（死亡/受击优先级更高，故置于末尾） */
            to: 'air_attacking',
            guard: (input, entity) => input.attack && canStartAirAttack(entity),
        },
    ],
}
