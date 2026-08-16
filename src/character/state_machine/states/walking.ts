import type {StateHandler} from '../types.ts'
import {SLOPE_WALK_THRESHOLD, SLOPE_TRANSIENT_MIN_NY, STATE_FLIP_MIN_TIME} from '../constants.ts'
import {shouldFall, isSupportedOn, projectToSlopeAtSpeed, applySlopeSink} from '../ground.ts'
import {resolveEntrySkillIndex} from '../../combat/combo_guard.ts'

export const walkingHandler: StateHandler = {
    enter: (entity) => {
        entity.body.wakeUp()
    },
    update: (_dt, input, entity) => {
        const len = Math.hypot(input.dx, input.dz)
        if (len < 0.001) return
        const speed = entity.config.speed
        const dx = input.dx / len
        const dz = input.dz / len
        if (!projectToSlopeAtSpeed(entity, dx, dz, speed, SLOPE_WALK_THRESHOLD)) {
            /* 行走阈值以下接触：可能是瞬态棱法线伪影（胶囊跨过 trimesh 网格棱线），
             * 仍按支撑面限速投影，防止纯水平速度把角色沿近平垂直墙面甩离表面 */
            if (!projectToSlopeAtSpeed(entity, dx, dz, speed, SLOPE_TRANSIENT_MIN_NY)) {
                const linvel = entity.body.linvel()
                entity.body.setLinvel({x: dx * speed, y: linvel.y, z: dz * speed}, true)
            }
        } else {
            /* 弹跳悬空（宽限期）时向坡面吸附，快速落回 */
            applySlopeSink(entity)
        }
    },
    exit: () => {},
    transitions: [
        { to: 'idle', guard: (input) => Math.hypot(input.dx, input.dz) < 0.001 },
        {
            to: 'attacking',
            /* 起手选择：键组内按守卫（蓄力/方向组合键）与冷却解析，存在候选才进入 */
            guard: (input, entity) => input.attack
                && resolveEntrySkillIndex(entity.combat, input.skillIndex, {dx: input.dx, dz: input.dz, holdDuration: input.attackHoldDuration}) >= 0,
        },
        {
            to: 'jumping',
            guard: (input, entity) =>
                input.jump && isSupportedOn(entity, SLOPE_WALK_THRESHOLD),
        },
        {
            to: 'dashing',
            guard: (input, entity) => input.sprint && entity.combat.dashSkill.cooldownTimer <= 0,
        },
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
        {
            to: 'flinching',
            guard: (_input, entity) => entity.combat.pendingFlinch && entity.combat.health > 0,
        },
        {
            to: 'falling',
            guard: (_input, entity) =>
                shouldFall(entity) && entity.airborneTime >= STATE_FLIP_MIN_TIME,
        },
    ],
}
