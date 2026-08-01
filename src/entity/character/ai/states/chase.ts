import {Vec3} from 'cannon-es'
import type {AIStateHandler} from '../types.ts'

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
        _dir.scale(1 / dist, _dir)
        setInput(_dir.x, _dir.z, false)
    },
    exit: () => {},
    transitions: [
        {
            to: 'attack',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, tp.y - pos.y, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                const skillRange = skill?.config.range ?? 1.5
                return _dir.length() < skillRange
                    && (skill?.cooldownTimer ?? Infinity) <= 0
            },
        },
        {
            to: 'patrol',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.targetId)
                if (!target || target.combat.isDead) return true
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, tp.y - pos.y, tp.z - pos.z)
                const detRange = character.combat.skills[character.combat.currentSkillIndex]?.config.type === 'ranged'
                    ? (character.combat.skills[character.combat.currentSkillIndex]?.config.range ?? 10) * 1.5 : 12
                return _dir.length() > detRange
            },
        },
    ],
}
