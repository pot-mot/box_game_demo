import {Vec3} from 'cannon-es'
import type {AIStateHandler} from '../types.ts'

const _dir = new Vec3()

export const patrolHandler: AIStateHandler = {
    enter: (ctx, _character) => {
        const r = ctx.patrolRadius * 0.8
        ctx.waypoint.x = ctx.spawnPoint.x + (Math.random() - 0.5) * r * 2
        ctx.waypoint.y = ctx.spawnPoint.y
        ctx.waypoint.z = ctx.spawnPoint.z + (Math.random() - 0.5) * r * 2
        ctx.waitTimer = 0
        ctx.targetId = undefined
    },
    update: (_dt, ctx, character, _allCharacters, setInput) => {
        const pos = character.body.position
        _dir.set(ctx.waypoint.x - pos.x, 0, ctx.waypoint.z - pos.z)
        const dist = _dir.length()

        if (dist < 0.3) {
            ctx.waitTimer += _dt
            setInput(0, 0, false)
            if (ctx.waitTimer > 1.5) {
                const r = ctx.patrolRadius * 0.8
                ctx.waypoint.x = ctx.spawnPoint.x + (Math.random() - 0.5) * r * 2
                ctx.waypoint.z = ctx.spawnPoint.z + (Math.random() - 0.5) * r * 2
                ctx.waitTimer = 0
            }
        } else {
            _dir.scale(1 / dist, _dir)
            setInput(_dir.x, _dir.z, false)
        }
    },
    exit: () => {},
    transitions: [{
        to: 'chase',
        guard: (ctx, character, allCharacters) => {
            let bestDist = Infinity
            let bestId: number | undefined
            const pos = character.body.position
            const skill = character.combat.skills[character.combat.currentSkillIndex]
            const detRange = skill?.config.weapon.detectionRange ?? 8
            const los = ctx.losChecker

            for (const other of allCharacters) {
                if (other.id === character.id || other.combat.isDead) continue
                if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue

                const op = other.body.position
                const dx = op.x - pos.x
                const dz = op.z - pos.z
                const d = Math.hypot(dx, dz)
                if (d >= detRange || d >= bestDist) continue

                if (los && !los.hasLOS(pos.x, pos.y + 0.5, pos.z, op.x, op.y + 0.5, op.z)) continue

                bestDist = d
                bestId = other.id
            }

            if (bestId !== undefined) {
                ctx.targetId = bestId
                return true
            }
            return false
        },
    }],
}
