import {Vec3} from 'cannon-es'
import type {AIStateHandler} from '../types.ts'
import type {RangedSkillConfig} from '../../../../character/combat/ranged_skill.ts'

const _dir = new Vec3()

export const chaseHandler: AIStateHandler = {
    enter: () => {},
    update: (_dt, ctx, character, allCharacters, setInput) => {
        const target = allCharacters.find(c => c.id === ctx.targetId)
        if (!target || target.combat.isDead) { setInput(0, 0, false); return }

        const pos = character.body.position
        const tp = target.body.position
        _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
        const dist = _dir.length()

        if (dist < 0.01) { setInput(0, 0, false); return }

        const skill = character.combat.skills[character.combat.currentSkillIndex]

        /* aggressive 策略：远程也追到近战距离 */
        if (ctx.strategy === 'aggressive') {
            if (skill?.config.type === 'ranged') {
                const skillRange = skill.config.weapon.range
                if (dist < skillRange) { setInput(0, 0, false); return }
            }
        } else if (skill?.config.type === 'ranged') {
            /* tactical / cowardly：远程在理想距离停下 */
            const ideal = (skill.config as RangedSkillConfig).weapon.idealRange
            if (dist < ideal * 1.3) { setInput(0, 0, false); return }
        }

        _dir.scale(1 / dist, _dir)
        setInput(_dir.x, _dir.z, false)
    },
    exit: () => {},
    transitions: [
        {
            /* 追逐超时 → 放弃 */
            to: 'patrol',
            guard: (ctx) => {
                const timeout = ctx.strategyConfig.chaseTimeout
                if (timeout <= 0) return false
                return ctx.stateTime >= timeout
            },
        },
        {
            /* cowardly 策略：接近敌人后逃跑 */
            to: 'flee',
            guard: (ctx, character, allCharacters) => {
                if (ctx.strategy !== 'cowardly') return false
                if (ctx.burstAttackCount >= ctx.strategyConfig.attackBurstCount) return false
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                const dist = Math.hypot(tp.x - pos.x, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                const detRange = skill?.config.weapon.detectionRange ?? 8
                return dist < detRange * 0.5
            },
        },
        {
            to: 'approach',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill || skill.config.type !== 'ranged') return false

                /* aggressive 策略：更短的理想距离 */
                const cfg = skill.config as RangedSkillConfig
                const threshold = ctx.strategy === 'aggressive'
                    ? cfg.weapon.range * 1.5
                    : cfg.weapon.idealRange * 1.3
                return _dir.length() < threshold
                    && (skill.cooldownTimer ?? Infinity) <= 0
            },
        },
        {
            to: 'attack',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill) return false

                /* aggressive 策略：远程也可进入攻击 */
                const skillRange = skill.config.weapon.range
                if (ctx.strategy === 'aggressive') {
                    return _dir.length() < skillRange
                        && (skill.cooldownTimer ?? Infinity) <= 0
                }

                /* 默认：仅近战可进入攻击 */
                if (skill.config.type === 'ranged') return false
                return _dir.length() < skillRange
                    && (skill.cooldownTimer ?? Infinity) <= 0
            },
        },
        {
            to: 'patrol',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return true
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                const detRange = skill?.config.weapon.detectionRange ?? 8
                return _dir.length() > detRange
            },
        },
    ],
}
