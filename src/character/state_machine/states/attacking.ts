import type {StateHandler} from '../types.ts'
import {SLOPE_WALK_THRESHOLD} from '../constants.ts'
import {shouldFall, isSupportedOn, projectToSlope, applySlopeAntiGravity} from '../ground.ts'

/** 近战挥砍倾斜角范围：最小 60°（PI/3），最大 180°（PI） */
const TILT_MIN = Math.PI / 3
const TILT_MAX = Math.PI

const randomTilt = (): number => {
    const magnitude = TILT_MIN + Math.random() * (TILT_MAX - TILT_MIN)
    const sign = Math.random() < 0.5 ? 1 : -1
    return magnitude * sign
}

export const attackingHandler: StateHandler = {
    enter: (entity) => {
        const c = entity.combat
        c.attackActive = true
        c.attackTimer = 0
        c.attackedTargets.clear()
        const skill = c.skills[c.currentSkillIndex]
        c.swingTilt = skill?.config.type === 'melee' ? randomTilt() : 0
        entity.body.wakeUp()
    },
    update: (dt, _input, entity) => {
        entity.combat.attackTimer += dt
        const vx = entity.body.velocity.x * 0.3
        const vz = entity.body.velocity.z * 0.3
        /* 斜坡防滑：可站立坡面上速度清零并沿坡投影 + 反力抵消重力沿坡分量，防止攻击中自然下滑 */
        if (!projectToSlope(entity, 0, 0, SLOPE_WALK_THRESHOLD)) {
            entity.body.velocity.x = vx
            entity.body.velocity.z = vz
        } else {
            applySlopeAntiGravity(entity)
        }
        entity.body.wakeUp()
    },
    exit: (entity) => {
        const c = entity.combat
        c.attackActive = false
        const skill = c.skills[c.currentSkillIndex]
        if (skill) skill.cooldownTimer = skill.config.cooldown
    },
    transitions: [
        {
            to: 'walking',
            guard: (input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                return entity.combat.attackTimer >= (skill?.config.duration ?? 0)
                    && Math.hypot(input.dx, input.dz) > 0.001
                    && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
            },
        },
        {
            to: 'idle',
            guard: (_input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                return entity.combat.attackTimer >= (skill?.config.duration ?? 0)
                    && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
            },
        },
        {
            to: 'jumping',
            guard: (input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                return entity.combat.attackTimer >= (skill?.config.duration ?? 0)
                    && input.jump
                    && isSupportedOn(entity, SLOPE_WALK_THRESHOLD)
            },
        },
        {
            to: 'falling',
            guard: (_input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                return entity.combat.attackTimer >= (skill?.config.duration ?? 0)
                    && shouldFall(entity)
            },
        },
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
    ],
}
