import {Vec3} from 'cannon-es'
import type {AIStateHandler} from '../types.ts'
import type {RangedSkillConfig} from '../../../../character/combat/ranged_skill.ts'

const _dir = new Vec3()

export const approachHandler: AIStateHandler = {
    enter: (ctx, _character) => {
        ctx.strafeTimer = 0
    },
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

        /* aggressive 策略：使用攻击距离而非理想距离 */
        const effectiveRange = ctx.strategy === 'aggressive' ? cfg.weapon.range : cfg.weapon.idealRange

        if (dist < effectiveRange) {
            if (!character.combat.attackActive && skill.cooldownTimer <= 0) {
                setInput(adx, adz, true)
            } else {
                setInput(0, 0, false)
            }
        } else {
            if (!character.combat.attackActive && skill.cooldownTimer <= 0 && dist < effectiveRange * 1.1) {
                setInput(adx, adz, true)
            } else {
                setInput(adx, adz, false)
            }
        }
    },
    exit: () => {},
    transitions: [
        {
            /* 逼近超时 → 重新追逐 */
            to: 'chase',
            guard: (ctx) => {
                const timeout = ctx.strategyConfig.approachTimeout
                if (timeout <= 0) return false
                return ctx.stateTime >= timeout
            },
        },
        {
            /* cowardly 策略：敌人太近就逃跑 */
            to: 'flee',
            guard: (ctx, character, allCharacters) => {
                if (ctx.strategy !== 'cowardly') return false
                if (ctx.burstAttackCount >= ctx.strategyConfig.attackBurstCount) return false
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill || skill.config.type !== 'ranged') return false
                const cfg = skill.config as RangedSkillConfig
                return Math.hypot(tp.x - pos.x, tp.z - pos.z) < cfg.weapon.retreatRange
            },
        },
        {
            /* aggressive 策略：进入攻击而非扫射 */
            to: 'attack',
            guard: (ctx, character, allCharacters) => {
                if (ctx.strategy !== 'aggressive') return false
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill) return false
                const cooldownOk = (skill.cooldownTimer ?? Infinity) <= 0
                return _dir.length() < skill.config.weapon.range && cooldownOk
            },
        },
        {
            to: 'volley',
            guard: (ctx, character, allCharacters) => {
                /* aggressive 策略跳过 volley */
                if (ctx.strategy === 'aggressive') return false
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill || skill.config.type !== 'ranged') return false
                const cfg = skill.config as RangedSkillConfig
                const cooldownOk = (skill.cooldownTimer ?? Infinity) <= 0
                return _dir.length() < cfg.weapon.idealRange + 0.5 && cooldownOk
            },
        },
        {
            to: 'chase',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill || skill.config.type !== 'ranged') return false
                const cfg = skill.config as RangedSkillConfig
                const threshold = ctx.strategy === 'aggressive'
                    ? cfg.weapon.range * 2
                    : cfg.weapon.idealRange * 1.5
                return _dir.length() > threshold
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
