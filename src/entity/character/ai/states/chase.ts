import {Vec3} from 'cannon-es'
import type {AIStateHandler} from '../types.ts'

const _dir = new Vec3()

export const chaseHandler: AIStateHandler = {
    enter: () => {},
    update: (_dt, ctx, character, allCharacters, setInput) => {
        const target = allCharacters.find(c => c.id === ctx.targetId)
        if (!target || target.isDead) { setInput(0, 0, false); return }

        const pos = character.body.position
        const tp = target.body.position
        _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
        const dist = _dir.length()

        if (dist < 0.01) { setInput(0, 0, false); return }
        _dir.scale(1 / dist, _dir)
        setInput(_dir.x, _dir.z, false)
    },
    exit: () => {},
    transitions: [
        {
            to: 'attack',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, tp.y - pos.y, tp.z - pos.z)
                return _dir.length() < character.attackSlot.range
                    && character.attackCooldownTimer <= 0
            },
        },
        {
            to: 'patrol',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.isDead) return true
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, tp.y - pos.y, tp.z - pos.z)
                const detRange = character.attackSlot.type === 'ranged' ? character.attackSlot.range * 1.5 : 12
                return _dir.length() > detRange
            },
        },
    ],
}
