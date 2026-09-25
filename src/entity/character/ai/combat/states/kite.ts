import {v3Set, v3Length, type RapVector3} from '../../../../../physics/rapier_utils.ts'
import type {CombatStateHandler} from '../types.ts'
import {canStartAttack} from '../../../../../character/combat/attack_runtime.ts'
import {MELEE_FALLBACK_DETECT_RANGE} from '../../../combat/constants.ts'
import {COMBAT_LOSE_RANGE_FACTOR} from '../../constants.ts'

const _dir: RapVector3 = {x: 0, y: 0, z: 0}

export const kiteHandler: CombatStateHandler = {
    enter: () => {},
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

        if (!character.combat.attackActive
            && canStartAttack(character.combat, {dx: adx, dz: adz, holdDuration: 0, attackKey: 'light'})
            && dist <= weapon.range) {
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
                const timeout = ctx.combatConfig.kiteTimeout
                if (timeout <= 0) return false
                if (ctx.combatStateTime < timeout) return false
                /* 需要目标在攻击距离内（近战用攻击检测箱，checker 缺失时回退距离判定） */
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const weapon = character.combat.weapon
                if (weapon.type === 'melee' && ctx.attackDetectChecker) {
                    return ctx.attackDetectChecker(character, target)
                }
                const pos = character.body.translation()
                const tp = target.body.translation()
                /* 近战无射程概念，用检测回退常量默认值 */
                const fallbackRange = weapon.type === 'melee' ? MELEE_FALLBACK_DETECT_RANGE : weapon.range
                return Math.hypot(tp.x - pos.x, tp.z - pos.z) < fallbackRange
            },
        },
        {
            /* 后退超时且目标不在射程 → 重新追逐 */
            to: 'chase',
            guard: (ctx) => {
                const timeout = ctx.combatConfig.kiteTimeout
                if (timeout <= 0) return false
                return ctx.combatStateTime >= timeout
            },
        },
        {
            /* cowardly 策略：直接逃而不是后退 */
            to: 'flee',
            guard: (ctx) => {
                if (ctx.combatStrategy !== 'cowardly') return false
                return ctx.combatBurstAttackCount < ctx.combatConfig.attackBurstCount;
            },
        },
        {
            to: 'volley',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.translation()
                const tp = target.body.translation()
                v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
                const weapon = character.combat.weapon
                if (weapon.type !== 'ranged') return false
                return v3Length(_dir) > weapon.retreatRange * 1.5
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
