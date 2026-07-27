import {Vec3} from 'cannon-es'
import type {AIStateHandler} from '../types.ts'

const _dir = new Vec3()

export const attackHandler: AIStateHandler = {
    enter: () => {},
    update: (_dt, ctx, character, allCharacters, setInput) => {
        const target = allCharacters.find(c => c.id === ctx.targetId)
        if (!target || target.isDead) { setInput(0, 0, false); return }

        const pos = character.body.position
        const tp = target.body.position
        _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
        const dist = _dir.length()

        if (dist > character.attackSlot.range) { setInput(0, 0, false); return }

        const len = dist > 0.001 ? dist : 1
        const adx = _dir.x / len
        const adz = _dir.z / len

        if (!character.attackActive && character.attackCooldownTimer <= 0) {
            setInput(adx, adz, true)
        } else {
            setInput(0, 0, false)
        }
    },
    exit: () => {},
    transitions: [
        {
            to: 'chase',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, tp.y - pos.y, tp.z - pos.z)
                const detRange = character.attackSlot.type === 'ranged' ? character.attackSlot.range * 1.5 : 12
                return _dir.length() > character.attackSlot.range && _dir.length() < detRange
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
