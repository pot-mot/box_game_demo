import {Vec3} from 'cannon-es'
import type {AIStateHandler} from '../types.ts'

const _dir = new Vec3()

export const attackHandler: AIStateHandler = {
    enter: () => {},
    update: (_dt, ctx, character, allCharacters, setInput) => {
        const target = allCharacters.find(c => c.id === ctx.targetId)
        if (!target || target.combat.isDead) { setInput(0, 0, false); return }

        const pos = character.body.position
        const tp = target.body.position
        _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
        const dist = _dir.length()

        const skill = character.combat.skills[character.combat.currentSkillIndex]
        if (!skill || dist > skill.config.range) { setInput(0, 0, false); return }

        const len = dist > 0.001 ? dist : 1
        const adx = _dir.x / len
        const adz = _dir.z / len

        if (!character.combat.attackActive && skill.cooldownTimer <= 0) {
            setInput(adx, adz, true)
        } else if (skill.config.type === 'ranged' && dist < skill.config.range * 0.5) {
            setInput(-adx, -adz, false)
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
                if (!target || target.combat.isDead) return false
                const pos = character.body.position
                const tp = target.body.position
                _dir.set(tp.x - pos.x, 0, tp.z - pos.z)
                const detRange = character.combat.skills[character.combat.currentSkillIndex]?.config.type === 'ranged'
                    ? (character.combat.skills[character.combat.currentSkillIndex]?.config.range ?? 10) * 1.5 : 12
                const skillRange = character.combat.skills[character.combat.currentSkillIndex]?.config.range ?? 1.5
                return _dir.length() > skillRange && _dir.length() < detRange
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
                const detRange = character.combat.skills[character.combat.currentSkillIndex]?.config.type === 'ranged'
                    ? (character.combat.skills[character.combat.currentSkillIndex]?.config.range ?? 10) * 1.5 : 12
                return _dir.length() > detRange
            },
        },
    ],
}
