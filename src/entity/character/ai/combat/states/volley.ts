import {Vec3} from 'cannon-es'
import type {CombatStateHandler} from '../types.ts'
import type {RangedSkillConfig} from '../../../../../character/combat/ranged_skill.ts'

const _dir = new Vec3()

export const volleyHandler: CombatStateHandler = {
    enter: (ctx, _character) => {
        ctx.combatStrafeDir = Math.random() < 0.5 ? 1 : -1
        ctx.combatStrafeTimer = 1.5
    },
    update: (_dt, ctx, character, allCharacters, setInput) => {
        const target = allCharacters.find(c => c.id === ctx.combatTargetId)
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

        ctx.combatStrafeTimer -= _dt
        if (ctx.combatStrafeTimer <= 0) {
            ctx.combatStrafeDir *= -1
            ctx.combatStrafeTimer = 1.5
        }

        if (!character.combat.attackActive && skill.cooldownTimer <= 0) {
            setInput(adx, adz, true)
        } else {
            const strafeX = -adz * ctx.combatStrafeDir
            const strafeZ = adx * ctx.combatStrafeDir
            setInput(strafeX * 0.7 + adx * 0.15, strafeZ * 0.7 + adz * 0.15, false)
        }

        let nearestId = target.id
        let nearestDist = dist
        for (const other of allCharacters) {
            if (other.id === character.id || other.combat.isDead) continue
            if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue
            const ox = other.body.position.x - pos.x
            const oz = other.body.position.z - pos.z
            const od = Math.hypot(ox, oz)
            if (od < cfg.weapon.detectionRange && od < nearestDist * 0.6) {
                nearestDist = od
                nearestId = other.id
            }
        }
        if (nearestId !== target.id) {
            ctx.combatTargetId = nearestId
        }
    },
    exit: () => {},
    transitions: [
        {
            /* 扫射超时 → 变招追逐 */
            to: 'chase',
            guard: (ctx) => {
                const timeout = ctx.combatConfig.volleyTimeout
                if (timeout <= 0) return false
                return ctx.combatStateTime >= timeout
            },
        },
        {
            /* cowardly 策略：扫射时敌人靠近就逃 */
            to: 'flee',
            guard: (ctx, character, allCharacters) => {
                if (ctx.combatStrategy !== 'cowardly') return false
                if (ctx.combatBurstAttackCount >= ctx.combatConfig.attackBurstCount) return false
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
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
            to: 'approach',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill || skill.config.type !== 'ranged') return false
                const cfg = skill.config as RangedSkillConfig
                return _dir.length() > cfg.weapon.idealRange * 1.3
            },
        },
        {
            to: 'kite',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill || skill.config.type !== 'ranged') return false
                const cfg = skill.config as RangedSkillConfig
                return _dir.length() < cfg.weapon.retreatRange
            },
        },
        {
            to: 'inactive',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
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
