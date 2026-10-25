import type {StateHandler} from '../types.ts'
import {GROUND_DAMPING, SLOPE_WALK_THRESHOLD, STATE_FLIP_MIN_TIME} from '../constants.ts'
import {shouldFall, isSupportedOn, projectToSlope, projectToSlopeAtSpeed, applySlopeAntiGravity, applySlopeSink} from '../ground.ts'
import {canStartAttack} from '../../combat/attack_runtime.ts'
import {moveSpeedOf} from '../../types.ts'
import {canAffordStaminaEntry, isStaminaExhausted} from '../../stamina/runtime.ts'

/**
 * 格挡状态：持盾且长按攻击键（`combat.blockHeld`）时进入；松开按键或格挡槽归零（见 `machine.ts` 全局破防检查）退出。
 * 期间按盾的 `moveSpeedMultiplier` 限速移动（沿用行走的斜坡投影 / 吸附逻辑），可被翻滚 / 受击 / 坠落中断。
 */
export const blockingHandler: StateHandler = {
    enter: (entity) => {
        entity.state.combat.blocking = true
        entity.body.wakeUp()
    },
    update: (_dt, input, entity) => {
        const mult = entity.state.combat.block?.moveSpeedMultiplier ?? 1
        const len = Math.hypot(input.dx, input.dz)
        if (len < 0.001) {
            /* 原地举盾：水平减速（与 idle 一致的阻尼），保留垂直速度 */
            const linvel = entity.body.linvel()
            if (!projectToSlope(entity, 0, 0, SLOPE_WALK_THRESHOLD)) {
                entity.body.setLinvel({x: linvel.x * GROUND_DAMPING, y: linvel.y, z: linvel.z * GROUND_DAMPING}, true)
            } else {
                applySlopeAntiGravity(entity)
            }
            return
        }
        const speed = moveSpeedOf(entity) * mult
        const dx = input.dx / len
        const dz = input.dz / len
        if (!projectToSlopeAtSpeed(entity, dx, dz, speed, SLOPE_WALK_THRESHOLD)) {
            const linvel = entity.body.linvel()
            entity.body.setLinvel({x: dx * speed, y: linvel.y, z: dz * speed}, true)
        } else {
            applySlopeSink(entity)
        }
    },
    exit: (entity) => {
        entity.state.combat.blocking = false
    },
    transitions: [
        {
            to: 'interacting',
            guard: (input, entity) => input.interact && entity.state.interaction.active === true,
        },
        {
            to: 'attacking',
            guard: (input, entity) => entity.state.combat.blockHeld === false
                && input.attack
                && canAffordStaminaEntry(entity.state.stamina, 'attack')
                && canStartAttack(entity.state.combat, {
                    dx: input.dx,
                    dz: input.dz,
                    holdDuration: input.attackHoldDuration,
                    attackKey: input.attackKey,
                }),
        },
        { to: 'walking', guard: (input, entity) => (entity.state.combat.blockHeld === false || isStaminaExhausted(entity.state.stamina)) && Math.hypot(input.dx, input.dz) > 0.001 },
        { to: 'idle', guard: (input, entity) => (entity.state.combat.blockHeld === false || isStaminaExhausted(entity.state.stamina)) && Math.hypot(input.dx, input.dz) < 0.001 },
        {
            to: 'jumping',
            guard: (input, entity) => entity.state.combat.blockHeld === false
                && input.jump
                && canAffordStaminaEntry(entity.state.stamina, 'jump')
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'rolling',
            guard: (input, entity) => input.roll
                && canAffordStaminaEntry(entity.state.stamina, 'roll')
                && entity.state.combat.rollSkill.cooldownTimer <= 0,
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
            guard: (_input, entity) => shouldFall(entity) && entity.state.physics.airborneTime >= STATE_FLIP_MIN_TIME,
        },
    ],
}
