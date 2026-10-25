import type {StateHandler} from '../types.ts'
import {SLOPE_WALK_THRESHOLD, SLOPE_TRANSIENT_MIN_NY, SPRINT_SPEED_MULTIPLIER, STATE_FLIP_MIN_TIME, SWIM_ENTER_FLUID} from '../constants.ts'
import {shouldFall, isSupportedOn, projectToSlopeAtSpeed, applySlopeSink} from '../ground.ts'
import {fluidFractionOf} from '../fluid.ts'
import {canStartAttack} from '../../combat/attack_runtime.ts'
import {moveSpeedOf} from '../../types.ts'
import {canAffordStaminaEntry, isStaminaExhausted} from '../../stamina/runtime.ts'
import {canEnterFlight} from './flying.ts'

/**
 * 跑步状态：长按翻滚键（`input.sprint`）且存在移动输入时由行走进入。
 * 持续消耗体力；体力耗尽或松开按键立即回到行走 / 待机。
 */
export const sprintingHandler: StateHandler = {
    enter: (entity) => {
        entity.body.wakeUp()
    },
    update: (_dt, input, entity) => {
        const len = Math.hypot(input.dx, input.dz)
        if (len < 0.001) return
        const speed = moveSpeedOf(entity) * SPRINT_SPEED_MULTIPLIER
        const dx = input.dx / len
        const dz = input.dz / len
        if (!projectToSlopeAtSpeed(entity, dx, dz, speed, SLOPE_WALK_THRESHOLD)) {
            if (!projectToSlopeAtSpeed(entity, dx, dz, speed, SLOPE_TRANSIENT_MIN_NY)) {
                const linvel = entity.body.linvel()
                entity.body.setLinvel({x: dx * speed, y: linvel.y, z: dz * speed}, true)
            }
        } else {
            applySlopeSink(entity)
        }
    },
    exit: () => {},
    transitions: [
        {
            to: 'swimming',
            guard: (_input, entity) => fluidFractionOf(entity) >= SWIM_ENTER_FLUID,
        },
        {
            to: 'interacting',
            guard: (input, entity) => input.interact && entity.state.interaction.active === true,
        },
        {
            to: 'blocking',
            guard: (_input, entity) => entity.state.combat.blockHeld
                && entity.state.combat.block !== undefined
                && entity.state.combat.guard > 0
                && entity.state.combat.health > 0,
        },
        {
            to: 'attacking',
            guard: (input, entity) => input.attack
                && canAffordStaminaEntry(entity.state.stamina, 'attack')
                && canStartAttack(entity.state.combat, {
                    dx: input.dx,
                    dz: input.dz,
                    holdDuration: input.attackHoldDuration,
                    attackKey: input.attackKey,
                }),
        },
        {
            to: 'flying',
            guard: (input, entity) => input.fly && canEnterFlight(entity),
        },
        {
            to: 'rolling',
            guard: (input, entity) => input.roll
                && canAffordStaminaEntry(entity.state.stamina, 'roll')
                && entity.state.combat.rollSkill.cooldownTimer <= 0,
        },
        {
            to: 'walking',
            guard: (input, entity) =>
                Math.hypot(input.dx, input.dz) > 0.001
                && (!input.sprint || isStaminaExhausted(entity.state.stamina)),
        },
        { to: 'idle', guard: (input) => Math.hypot(input.dx, input.dz) < 0.001 },
        {
            to: 'jumping',
            guard: (input, entity) =>
                input.jump
                && canAffordStaminaEntry(entity.state.stamina, 'jump')
                && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
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
