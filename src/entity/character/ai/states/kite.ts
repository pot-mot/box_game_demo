import {Vec3} from 'cannon-es'
import type {AIStateHandler} from '../types.ts'
import type {RangedSkillConfig} from '../../../../character/combat/ranged_skill.ts'

const _dir = new Vec3()

export const kiteHandler: AIStateHandler = {
    enter: () => {},
    update: (_dt, ctx, character, allCharacters, setInput) => {
        const target = allCharacters.find(c => c.id === ctx.targetId)
        if (!target || target.combat.isDead) { setInput(0, 0, false); return }

        const pos = character.body.position
        const tp = target.body.position
        _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
        const dist = _dir.length()

        const skill = character.combat.skills[character.combat.currentSkillIndex]
        if (!skill || skill.config.type !== 'ranged') { setInput(0, 0, false); return }
        const cfg = skill.config as RangedSkillConfig

        if (dist < 0.01) { setInput(0, 0, false); return }
        const len = dist
        const adx = _dir.x / len
        const adz = _dir.z / len

        if (!character.combat.attackActive && skill.cooldownTimer <= 0 && dist <= cfg.weapon.range) {
            setInput(adx, adz, true)
        } else {
            setInput(-adx, -adz, false)
        }
    },
    exit: () => {},
    transitions: [
        {
            /* 后退超时 → 尝试还击或重新逼近 */
            to: 'attack',
            guard: (ctx, character, allCharacters) => {
                const timeout = ctx.strategyConfig.kiteTimeout
                if (timeout <= 0) return false
                if (ctx.stateTime < timeout) return false
                /* 需要目标在攻击距离内 */
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill) return false
                return Math.hypot(tp.x - pos.x, tp.z - pos.z) < skill.config.weapon.range
            },
        },
        {
            /* 后退超时且目标不在射程 → 重新追逐 */
            to: 'chase',
            guard: (ctx) => {
                const timeout = ctx.strategyConfig.kiteTimeout
                if (timeout <= 0) return false
                return ctx.stateTime >= timeout
            },
        },
        {
            /* cowardly 策略：直接逃而不是后退 */
            to: 'flee',
            guard: (ctx) => {
                if (ctx.strategy !== 'cowardly') return false
                return ctx.burstAttackCount < ctx.strategyConfig.attackBurstCount;

            },
        },
        {
            to: 'volley',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill || skill.config.type !== 'ranged') return false
                const cfg = skill.config as RangedSkillConfig
                return _dir.length() > cfg.weapon.retreatRange * 1.5
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
