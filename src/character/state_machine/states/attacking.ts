import type {StateHandler} from '../types.ts'

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
        entity.body.velocity.x *= 0.3
        entity.body.velocity.z *= 0.3
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
                    && entity.isOnGround
            },
        },
        {
            to: 'idle',
            guard: (_input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                return entity.combat.attackTimer >= (skill?.config.duration ?? 0)
                    && entity.isOnGround
            },
        },
        {
            to: 'jumping',
            guard: (input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                return entity.combat.attackTimer >= (skill?.config.duration ?? 0)
                    && input.jump
                    && entity.isOnGround
            },
        },
        {
            to: 'falling',
            guard: (_input, entity) => {
                const skill = entity.combat.skills[entity.combat.currentSkillIndex]
                return entity.combat.attackTimer >= (skill?.config.duration ?? 0)
                    && !entity.isOnGround
            },
        },
        {
            to: 'dying',
            guard: (_input, entity) => entity.combat.health <= 0,
        },
    ],
}
