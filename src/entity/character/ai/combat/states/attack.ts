import {v3Set, v3Length, type RapVector3} from '../../../../../physics/rapier_utils.ts'
import type {CombatStateHandler} from '../types.ts'
import {canStartAttack} from '../../../../../character/combat/attack_runtime.ts'
import {COMBAT_LOSE_RANGE_FACTOR} from '../../constants.ts'
import {aimAndFireAt} from '../aim.ts'
import {inMeleeAttackRegion} from '../range.ts'

const _dir: RapVector3 = {x: 0, y: 0, z: 0}

export const attackHandler: CombatStateHandler = {
    enter: () => {},
    update: (_dt, ctx, character, allCharacters, setInput) => {
        const target = allCharacters.find(c => c.state.identity.id === ctx.combatTargetId)
        if (!target || target.state.combat.isDead) { setInput(0, 0, false); return }

        const pos = character.body.translation()
        const tp = target.body.translation()
        v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
        const dist = v3Length(_dir)

        /* 武器恒存在（无技能槽模型），攻击动作参数与射程直接从装备武器读取 */
        const weapon = character.state.combat.weapon

        /* 出招门控：目标在攻击检测箱内才出招（checker 缺失时回退圆形距离判定；近战无射程概念用常量默认值） */
        const inHitRegion = weapon.type === 'ranged'
            ? dist <= weapon.range
            : inMeleeAttackRegion(ctx, character, target)
        if (!inHitRegion) { setInput(0, 0, false); return }

        const len = dist > 0.001 ? dist : 1
        const adx = _dir.x / len
        const adz = _dir.z / len
        const canStart = canStartAttack(character.state.combat, {dx: adx, dz: adz, holdDuration: 0, attackKey: 'light'})

        if (weapon.type === 'ranged') {
            /* 远程：站定转身瞄准 → 开火（射击动作期间保持面向目标、原地不动） */
            if (character.state.combat.attackActive) {
                ctx.combatAimActive = true
                setInput(0, 0, false)
            } else if (canStart) {
                aimAndFireAt(ctx, character, target, setInput)
            } else {
                setInput(0, 0, false)
            }
            return
        }

        /* 近战：进入攻击距离后原地出招 / 续链，仅把目标方向作为攻击与朝向意图。
         * 不能再输出移动分量，否则 AI 会持续把对方顶开再追上去（两近战反复弹开）。 */
        if (character.state.combat.attackActive || canStart) {
            setInput(0, 0, true, adx, adz)
        } else {
            /* 攻击冷却期间同样原地保持面向目标，不向前顶 */
            setInput(0, 0, false, adx, adz)
        }
    },
    exit: () => {},
    transitions: [
        {
            /* cowardly 策略：攻击超时后立即逃跑（须先于通用超时检查，否则永远不可达） */
            to: 'flee',
            guard: (ctx) => {
                if (ctx.combatStrategy !== 'cowardly') return false
                return ctx.combatStateTime >= ctx.combatConfig.attackTimeout
            },
        },
        {
            /* 攻击超时 → 调整位置 */
            to: 'chase',
            guard: (ctx) => {
                const timeout = ctx.combatConfig.attackTimeout
                if (timeout <= 0) return false
                return ctx.combatStateTime >= timeout
            },
        },
        {
            to: 'chase',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.state.identity.id === ctx.combatTargetId)
                if (!target || target.state.combat.isDead) return false
                const pos = character.body.translation()
                const tp = target.body.translation()
                v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
                const weapon = character.state.combat.weapon
                const detRange = weapon.detectionRange
                /* 出攻击检测箱 → 追击（近战与出招判定同源，ranged 用武器射程） */
                const outOfRegion = weapon.type === 'ranged'
                    ? v3Length(_dir) > weapon.range
                    : !inMeleeAttackRegion(ctx, character, target)
                return outOfRegion && v3Length(_dir) < detRange
            },
        },
        {
            to: 'inactive',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.state.identity.id === ctx.combatTargetId)
                if (!target || target.state.combat.isDead) return true
                const pos = character.body.translation()
                const tp = target.body.translation()
                v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
                const detRange = character.state.combat.weapon.detectionRange
                return v3Length(_dir) >= detRange * COMBAT_LOSE_RANGE_FACTOR
            },
        },
    ],
}
