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
            for (const other of allCharacters) {
                if (other.id === character.id || other.isDead) continue
                if (!character.attackTendency(character.faction, other.faction)) continue
                const pos = character.body.position
                const op = other.body.position
                _dir.set(op.x - pos.x, op.y - pos.y, op.z - pos.z)
                if (_dir.length() < (character.attackSlot.type === 'ranged' ? character.attackSlot.range * 1.5 : 8)) {
                    ctx.targetId = other.id
                    return true
                }
            }
            return false
        },
    }],
}
