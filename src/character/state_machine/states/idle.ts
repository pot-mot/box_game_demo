import type {StateHandler} from '../types.ts'
import {GROUND_DAMPING, SLOPE_WALK_THRESHOLD, STATE_FLIP_MIN_TIME, SWIM_ENTER_FLUID} from '../constants.ts'
import {shouldFall, isSupportedOn, projectToSlope, applySlopeAntiGravity} from '../ground.ts'
import {fluidFractionOf} from '../fluid.ts'
import {canStartAttack} from '../../combat/attack_runtime.ts'

export const idleHandler: StateHandler = {
    enter: () => {},
    update: (_dt, _input, entity) => {
        const linvel = entity.body.linvel()
        const vx = linvel.x * GROUND_DAMPING
        const vz = linvel.z * GROUND_DAMPING
        /* 斜坡防滑：可站立坡面上速度清零并沿坡投影 + 反力抵消重力沿坡分量，防止自然下滑 */
        if (!projectToSlope(entity, 0, 0, SLOPE_WALK_THRESHOLD)) {
            entity.body.setLinvel({x: vx, y: linvel.y, z: vz}, true)
        } else {
            applySlopeAntiGravity(entity)
        }
    },
    exit: () => {},
    transitions: [
        {
            /* 入水：浸没时切换游泳 / 漂浮（对应 walking / idle），优先级最高 */
            to: 'swimming',
            guard: (input, entity) => fluidFractionOf(entity) >= SWIM_ENTER_FLUID && Math.hypot(input.dx, input.dz) > 0.001,
        },
        {
            to: 'floating',
            guard: (_input, entity) => fluidFractionOf(entity) >= SWIM_ENTER_FLUID,
        },
        {
            to: 'interacting',
            guard: (input, entity) => input.interact && entity.state.interaction.active === true,
        },
        {
            to: 'blocking',
            /* 持盾且长按格挡键（blockHeld）且格挡槽未空时举盾 */
            guard: (_input, entity) => entity.state.combat.blockHeld
                && entity.state.combat.block !== undefined
                && entity.state.combat.guard > 0
                && entity.state.combat.health > 0,
        },
        { to: 'walking', guard: (input) => Math.hypot(input.dx, input.dz) > 0.001 },
        {
            to: 'attacking',
            /* 起手解析：攻击键的起手候选按守卫（蓄力/方向组合键）与冷却求值，存在候选才进入 */
            guard: (input, entity) => input.attack
                && canStartAttack(entity.state.combat, {
                    dx: input.dx,
                    dz: input.dz,
                    holdDuration: input.attackHoldDuration,
                    attackKey: input.attackKey,
                }),
        },
        {
            to: 'jumping',
            guard: (input, entity) =>
                input.jump && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
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
            to: 'falling',
            guard: (_input, entity) =>
                shouldFall(entity) && entity.state.physics.airborneTime >= STATE_FLIP_MIN_TIME,
        },
    ],
}
