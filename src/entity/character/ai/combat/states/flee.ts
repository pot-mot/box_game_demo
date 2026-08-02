import {Vec3} from 'cannon-es'
import type {CombatStateHandler} from '../types.ts'
import type {RangedSkillConfig} from '../../../../../character/combat/ranged_skill.ts'

const _fleeDir = new Vec3()

export const fleeHandler: CombatStateHandler = {
    enter: (ctx, character) => {
        const pos = character.body.position

        /* 使用 spawn 中心作为备用逃离方向 */
        const dx = pos.x - ctx.spawnPoint.x
        const dz = pos.z - ctx.spawnPoint.z
        const fallbackLen = Math.hypot(dx, dz)
        if (fallbackLen > 0.001) {
            _fleeDir.set(dx / fallbackLen, 0, dz / fallbackLen)
        } else {
            _fleeDir.set(Math.random() - 0.5, 0, Math.random() - 0.5)
            const rl = _fleeDir.length()
            if (rl > 0.001) _fleeDir.scale(1 / rl, _fleeDir)
        }

        /* 方向随机偏移 ±30° */
        const angleOffset = (Math.random() - 0.5) * (Math.PI / 3)
        const cosA = Math.cos(angleOffset)
        const sinA = Math.sin(angleOffset)
        const fx = _fleeDir.x * cosA - _fleeDir.z * sinA
        const fz = _fleeDir.x * sinA + _fleeDir.z * cosA
        const fl = Math.hypot(fx, fz)
        ctx.combatFleeDir.x = fl > 0.001 ? fx / fl : 1
        ctx.combatFleeDir.z = fl > 0.001 ? fz / fl : 0
    },
    update: (_dt, ctx, character, allCharacters, setInput) => {
        const skill = character.combat.skills[character.combat.currentSkillIndex]
        const detRange = skill?.config.weapon.detectionRange ?? 8
        const pos = character.body.position

        /* 检查是否有附近敌人：从敌人方向逃离 */
        let nearestDist = Infinity
        let nearestDx = 0
        let nearestDz = 0
        for (const other of allCharacters) {
            if (other.id === character.id || other.combat.isDead) continue
            if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue
            const ox = other.body.position.x - pos.x
            const oz = other.body.position.z - pos.z
            const od = Math.hypot(ox, oz)
            if (od < detRange && od < nearestDist) {
                nearestDist = od
                nearestDx = ox
                nearestDz = oz
            }
        }

        if (nearestDist < Infinity) {
            const nl = Math.hypot(nearestDx, nearestDz)
            if (nl > 0.001) {
                /* 远离最近敌人 */
                ctx.combatFleeDir.x = -nearestDx / nl
                ctx.combatFleeDir.z = -nearestDz / nl
            }
        }

        /* 每隔 1.5 秒略微变化逃跑方向 */
        if (Math.floor(ctx.combatStateTime / 1.5) !== Math.floor((ctx.combatStateTime - _dt) / 1.5)) {
            const angleOffset = (Math.random() - 0.5) * (Math.PI / 4)
            const cosA = Math.cos(angleOffset)
            const sinA = Math.sin(angleOffset)
            const fx = ctx.combatFleeDir.x * cosA - ctx.combatFleeDir.z * sinA
            const fz = ctx.combatFleeDir.x * sinA + ctx.combatFleeDir.z * cosA
            ctx.combatFleeDir.x = fx
            ctx.combatFleeDir.z = fz
        }

        const isRanged = skill?.config.type === 'ranged'

        if (isRanged && !character.combat.attackActive && skill.cooldownTimer <= 0 && nearestDist < (skill.config as RangedSkillConfig).weapon.range) {
            /* 远程边逃边射 */
            setInput(ctx.combatFleeDir.x, ctx.combatFleeDir.z, true)
        } else {
            setInput(ctx.combatFleeDir.x, ctx.combatFleeDir.z, false)
        }
    },
    exit: () => {},
    transitions: [
        {
            /* 逃跑时长到达上限 → 若还可还击则尝试 attack，否则回 inactive */
            to: 'attack',
            guard: (ctx, character, allCharacters) => {
                if (ctx.combatStateTime < ctx.combatConfig.fleeDuration) return false
                if (ctx.combatBurstAttackCount >= ctx.combatConfig.attackBurstCount) return false
                /* 需要有有效目标 */
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                const detRange = skill?.config.weapon.detectionRange ?? 8
                const pos = character.body.position
                for (const other of allCharacters) {
                    if (other.id === character.id || other.combat.isDead) continue
                    if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue
                    const ox = other.body.position.x - pos.x
                    const oz = other.body.position.z - pos.z
                    if (Math.hypot(ox, oz) < detRange) {
                        ctx.combatTargetId = other.id
                        ctx.combatBurstAttackCount++
                        return true
                    }
                }
                return false
            },
        },
        {
            /* 逃跑完成（无目标或还击次数已满）→ inactive */
            to: 'inactive',
            guard: (ctx, character, allCharacters) => {
                if (ctx.combatStateTime < ctx.combatConfig.fleeDuration) return false
                if (ctx.combatBurstAttackCount < ctx.combatConfig.attackBurstCount) {
                    /* 若无可达目标，放弃 */
                    const skill = character.combat.skills[character.combat.currentSkillIndex]
                    const detRange = skill?.config.weapon.detectionRange ?? 8
                    const pos = character.body.position
                    let hasTarget = false
                    for (const other of allCharacters) {
                        if (other.id === character.id || other.combat.isDead) continue
                        if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue
                        if (Math.hypot(other.body.position.x - pos.x, other.body.position.z - pos.z) < detRange) {
                            hasTarget = true
                            break
                        }
                    }
                    if (hasTarget) return false
                }
                return true
            },
        },
        {
            /* 没有敌人在侦测范围内 → inactive */
            to: 'inactive',
            guard: (_ctx, character, allCharacters) => {
                const skill = character.combat.skills[character.combat.currentSkillIndex]
                const detRange = skill?.config.weapon.detectionRange ?? 8
                const pos = character.body.position
                for (const other of allCharacters) {
                    if (other.id === character.id || other.combat.isDead) continue
                    if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue
                    if (Math.hypot(other.body.position.x - pos.x, other.body.position.z - pos.z) < detRange) {
                        return false
                    }
                }
                return true
            },
        },
    ],
}
