import {v3Set, v3Length, type RapVector3} from '../../../../../physics/rapier_utils.ts'
import type {CombatStateHandler} from '../types.ts'

const _dir: RapVector3 = {x: 0, y: 0, z: 0}

export const attackHandler: CombatStateHandler = {
    enter: () => {},
    update: (_dt, ctx, character, allCharacters, setInput) => {
        const target = allCharacters.find(c => c.id === ctx.combatTargetId)
        if (!target || target.combat.isDead) { setInput(0, 0, false); return }

        const pos = character.body.translation()
        const tp = target.body.translation()
        v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
        const dist = v3Length(_dir)

        const skill = character.combat.skills[character.combat.currentSkillIndex]
        if (!skill) { setInput(0, 0, false); return }

        /* 出招门控：目标在武器攻击检测区域内才出招（checker 缺失时回退圆形距离判定） */
        const inHitRegion = ctx.weaponHitChecker
            ? ctx.weaponHitChecker(character, target)
            : dist <= skill.config.weapon.range
        if (!inHitRegion) { setInput(0, 0, false); return }

        const len = dist > 0.001 ? dist : 1
        const adx = _dir.x / len
        const adz = _dir.z / len

        /* 攻击中持续按住 attack → 缓冲自动续链；未攻击时冷却完毕才起链 */
        if (character.combat.attackActive || skill.cooldownTimer <= 0) {
            setInput(adx, adz, true)
        } else {
            setInput(0, 0, false)
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
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.translation()
                const tp = target.body.translation()
                v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                const detRange = skill?.config.weapon.detectionRange ?? 8
                /* 出攻击检测区域 → 追击（checker 缺失时回退距离判定） */
                const outOfRegion = ctx.weaponHitChecker
                    ? !ctx.weaponHitChecker(character, target)
                    : v3Length(_dir) > (skill?.config.weapon.range ?? 1.5)
                return outOfRegion && v3Length(_dir) < detRange
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
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                const detRange = skill?.config.weapon.detectionRange ?? 8
                return v3Length(_dir) >= detRange
            },
        },
    ],
}
