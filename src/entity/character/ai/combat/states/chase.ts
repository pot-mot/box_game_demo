import {v3Set, v3Length, type RapVector3} from '../../../../../physics/rapier_utils.ts'
import type {CombatStateHandler} from '../types.ts'
import type {RangedSkillConfig} from '../../../../../character/combat/ranged_skill.ts'
import {MELEE_FALLBACK_DETECT_RANGE} from '../../../combat/constants.ts'
import {COMBAT_LOSE_RANGE_FACTOR} from '../../constants.ts'

const _dir: RapVector3 = {x: 0, y: 0, z: 0}

export const chaseHandler: CombatStateHandler = {
    enter: () => {},
    update: (_dt, ctx, character, allCharacters, setInput) => {
        /* 卡死重试绕行阶段：按偏转方向侧向移动，打破贴脸顶牛/正面被堵 */
        if (ctx.combatDetourTimer > 0) {
            ctx.combatDetourTimer -= _dt
            setInput(ctx.combatDetourX, ctx.combatDetourZ, false)
            return
        }

        const target = allCharacters.find(c => c.id === ctx.combatTargetId)
        if (!target || target.combat.isDead) { setInput(0, 0, false); return }

        const pos = character.body.translation()
        const tp = target.body.translation()
        v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
        const dist = v3Length(_dir)

        if (dist < 0.01) { setInput(0, 0, false); return }

        const skill = character.combat.skills[character.combat.currentSkillIndex]

        /* aggressive 策略：远程也追到近战距离 */
        if (ctx.combatStrategy === 'aggressive') {
            if (skill?.config.type === 'ranged') {
                const skillRange = skill.config.weapon.range
                if (dist < skillRange) { setInput(0, 0, false); return }
            }
        } else if (skill?.config.type === 'ranged') {
            /* tactical / cowardly：远程在理想距离停下 */
            const ideal = (skill.config as RangedSkillConfig).weapon.idealRange
            if (dist < ideal * 1.3) { setInput(0, 0, false); return }
        }

        _dir.x /= dist
        _dir.z /= dist
        setInput(_dir.x, _dir.z, false)
    },
    exit: () => {},
    transitions: [
        {
            /* 追逐超时 → 放弃 */
            to: 'inactive',
            guard: (ctx) => {
                const timeout = ctx.combatConfig.chaseTimeout
                if (timeout <= 0) return false
                return ctx.combatStateTime >= timeout
            },
        },
        {
            /* cowardly 策略：接近敌人后逃跑 */
            to: 'flee',
            guard: (ctx, character, allCharacters) => {
                if (ctx.combatStrategy !== 'cowardly') return false
                if (ctx.combatBurstAttackCount >= ctx.combatConfig.attackBurstCount) return false
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.translation()
                const tp = target.body.translation()
                const dist = Math.hypot(tp.x - pos.x, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                const detRange = skill?.config.weapon.detectionRange ?? 8
                return dist < detRange * 0.5
            },
        },
        {
            to: 'approach',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.translation()
                const tp = target.body.translation()
                v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill || skill.config.type !== 'ranged') return false

                /* aggressive 策略：更短的理想距离 */
                const cfg = skill.config as RangedSkillConfig
                const threshold = ctx.combatStrategy === 'aggressive'
                    ? cfg.weapon.range * 1.5
                    : cfg.weapon.idealRange * 1.3
                return v3Length(_dir) < threshold
                    && (skill.cooldownTimer ?? Infinity) <= 0
            },
        },
        {
            to: 'attack',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return false
                const pos = character.body.translation()
                const tp = target.body.translation()
                v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                if (!skill) return false

                /* aggressive 策略：远程也可进入攻击（远程保持距离判定） */
                if (ctx.combatStrategy === 'aggressive' && skill.config.type === 'ranged') {
                    return v3Length(_dir) < skill.config.weapon.range
                        && (skill.cooldownTimer ?? Infinity) <= 0
                }

                /* 默认：仅近战可进入攻击（攻击检测箱检查，checker 缺失时回退常量距离判定） */
                if (skill.config.type === 'ranged') return false
                const inRegion = ctx.attackDetectChecker
                    ? ctx.attackDetectChecker(character, target)
                    : v3Length(_dir) < MELEE_FALLBACK_DETECT_RANGE
                return inRegion && (skill.cooldownTimer ?? Infinity) <= 0
            },
        },
        {
            /* 脱战：目标死亡/消失，或拉开到侦测半径 × 滞回系数之外（与进入阈值形成滞回） */
            to: 'inactive',
            guard: (ctx, character, allCharacters) => {
                const target = allCharacters.find(c => c.id === ctx.combatTargetId)
                if (!target || target.combat.isDead) return true
                const pos = character.body.translation()
                const tp = target.body.translation()
                v3Set(_dir, tp.x - pos.x, 0, tp.z - pos.z)
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                const detRange = skill?.config.weapon.detectionRange ?? 8
                return v3Length(_dir) >= detRange * COMBAT_LOSE_RANGE_FACTOR
            },
        },
    ],
}
