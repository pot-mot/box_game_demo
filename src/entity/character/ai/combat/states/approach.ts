import {v3Set, v3Length, type RapVector3} from '../../../../../physics/rapier_utils.ts'
import type {CombatStateHandler} from '../types.ts'
import {canStartAttack} from '../../../../../character/combat/attack_runtime.ts'
import {MELEE_FALLBACK_DETECT_RANGE} from '../../../combat/constants.ts'
import {COMBAT_LOSE_RANGE_FACTOR} from '../../constants.ts'

const _dir: RapVector3 = {x: 0, y: 0, z: 0}

export const approachHandler: CombatStateHandler = {
    enter: (ctx, _character) => {
        ctx.combatStrafeTimer = 0
    },
    update: (_dt, ctx, character, allCharacters, setInput) => {
        const target = allCharacters.find(c => c.id === ctx.combatTargetId)
        if (!target || target.combat.isDead) { setInput(0, 0, false); return }

        const pos = character.body.translation()
        const tp = target.body.translation()
        v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
        const dist = v3Length(_dir)

        const weapon = character.combat.weapon
        if (weapon.type !== 'ranged') { setInput(0, 0, false); return }

        if (dist < 0.01) { setInput(0, 0, false); return }
        const len = dist
        const adx = _dir.x / len
        const adz = _dir.z / len

        /* aggressive 策略：使用攻击距离而非理想距离 */
        const effectiveRange = ctx.combatStrategy === 'aggressive' ? weapon.range : weapon.idealRange

        if (dist < effectiveRange) {
            if (!character.combat.attackActive
                && canStartAttack(character.combat, {dx: adx, dz: adz, holdDuration: 0, attackKey: 'light'})) {
                setInput(adx, adz, true)
            } else {
                setInput(0, 0, false)
            }
        } else {
            if (!character.combat.attackActive
                && canStartAttack(character.combat, {dx: adx, dz: adz, holdDuration: 0, attackKey: 'light'})
                && dist < effectiveRange * 1.1) {
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
                const timeout = ctx.combatConfig.approachTimeout
                if (timeout <= 0) return false
                return ctx.combatStateTime >= timeout
            },
        },
        {
            /* cowardly 策略：敌人太近就逃跑 */
            to: 'flee',
            guard: (ctx, character, allCharacters) => {
                if (ctx.combatStrategy !== 'cowardly') return false
                if (ctx.combatBurstAttackCount >= ctx.combatConfig.attackBurstCount) return false
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.translation()
                const tp = target.body.translation()
                const weapon = character.combat.weapon
                if (weapon.type !== 'ranged') return false
                return Math.hypot(tp.x - pos.x, tp.z - pos.z) < weapon.retreatRange
            },
        },
        {
            /* aggressive 策略：进入攻击而非扫射 */
            to: 'attack',
            guard: (ctx, character, allCharacters) => {
                if (ctx.combatStrategy !== 'aggressive') return false
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.translation()
                const tp = target.body.translation()
                v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
                const weapon = character.combat.weapon
                const cooldownOk = canStartAttack(character.combat, {dx: _dir.x, dz: _dir.z, holdDuration: 0, attackKey: 'light'})
                /* 近战无射程概念，用检测回退常量默认值 */
                const skillRange = weapon.type === 'melee' ? MELEE_FALLBACK_DETECT_RANGE : weapon.range
                return v3Length(_dir) < skillRange && cooldownOk
            },
        },
        {
            to: 'volley',
            guard: (ctx, character, allCharacters) => {
                /* aggressive 策略跳过 volley */
                if (ctx.combatStrategy === 'aggressive') return false
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.translation()
                const tp = target.body.translation()
                v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
                const weapon = character.combat.weapon
                if (weapon.type !== 'ranged') return false
                const cooldownOk = canStartAttack(character.combat, {dx: _dir.x, dz: _dir.z, holdDuration: 0, attackKey: 'light'})
                return v3Length(_dir) < weapon.idealRange + 0.5 && cooldownOk
            },
        },
        {
            to: 'chase',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.translation()
                const tp = target.body.translation()
                v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
                const weapon = character.combat.weapon
                if (weapon.type !== 'ranged') return false
                const threshold = ctx.combatStrategy === 'aggressive'
                    ? weapon.range * 2
                    : weapon.idealRange * 1.5
                return v3Length(_dir) > threshold
            },
        },
        {
            to: 'inactive',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return true
                const pos = character.body.translation()
                const tp = target.body.translation()
                v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
                const detRange = character.combat.weapon.detectionRange
                return v3Length(_dir) >= detRange * COMBAT_LOSE_RANGE_FACTOR
            },
        },
    ],
}
