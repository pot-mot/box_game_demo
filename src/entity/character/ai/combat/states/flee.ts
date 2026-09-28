import {v3Set, v3Length, type RapVector3} from '../../../../../physics/rapier_utils.ts'
import type {CombatStateHandler} from '../types.ts'
import {canStartAttack} from '../../../../../character/combat/attack_runtime.ts'
import {COMBAT_SHOT_INTERVAL} from '../../constants.ts'
import {aimAndFireAt} from '../aim.ts'

const _fleeDir: RapVector3 = {x: 0, y: 0, z: 0}

export const fleeHandler: CombatStateHandler = {
    enter: (ctx, character) => {
        const pos = character.body.translation()

        /* 使用 spawn 中心作为备用逃离方向 */
        const dx = pos.x - ctx.spawnPoint.x
        const dz = pos.z - ctx.spawnPoint.z
        const fallbackLen = Math.hypot(dx, dz)
        if (fallbackLen > 0.001) {
            v3Set(_fleeDir, dx / fallbackLen, 0, dz / fallbackLen)
        } else {
            v3Set(_fleeDir, Math.random() - 0.5, 0, Math.random() - 0.5)
            const rl = v3Length(_fleeDir)
            if (rl > 0.001) { _fleeDir.x /= rl; _fleeDir.z /= rl }
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
    update: (dt, ctx, character, allCharacters, setInput) => {
        const weapon = character.combat.weapon
        const detRange = weapon.detectionRange
        const pos = character.body.translation()

        /* 检查是否有附近敌人：从敌人方向逃离（逃跑方向始终远离最近威胁） */
        let nearestDist = Infinity
        let nearestDx = 0
        let nearestDz = 0
        for (const other of allCharacters) {
            if (other.id === character.id || other.combat.isDead) continue
            if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue
            const ox = other.body.translation().x - pos.x
            const oz = other.body.translation().z - pos.z
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
        if (Math.floor(ctx.combatStateTime / 1.5) !== Math.floor((ctx.combatStateTime - dt) / 1.5)) {
            const angleOffset = (Math.random() - 0.5) * (Math.PI / 4)
            const cosA = Math.cos(angleOffset)
            const sinA = Math.sin(angleOffset)
            const fx = ctx.combatFleeDir.x * cosA - ctx.combatFleeDir.z * sinA
            const fz = ctx.combatFleeDir.x * sinA + ctx.combatFleeDir.z * cosA
            ctx.combatFleeDir.x = fx
            ctx.combatFleeDir.z = fz
        }

        /* 射击相位的瞄准目标必须与 world 的朝向锁定一致（`combatTargetId`）：
         * 否则会出现「面向 A、却按最近敌人 B 判定瞄准」→ 判定未对准而静默不开火 */
        const aimTarget = ctx.combatTargetId !== undefined
            ? allCharacters.find(c => c.id === ctx.combatTargetId && !c.combat.isDead)
            : undefined
        if (aimTarget !== undefined) {
            const tp = aimTarget.body.translation()
            const adx = tp.x - pos.x
            const adz = tp.z - pos.z
            const adist = Math.hypot(adx, adz)
            const rangedWeapon = weapon.type === 'ranged' ? weapon : undefined
            if (rangedWeapon !== undefined && adist > 0.001) {
                const ndx = adx / adist
                const ndz = adz / adist
                /* 射击相位：武器就绪（冷却）+ 开火节流到点 + 目标在射程内 → 站定转身瞄准 → 开火 */
                if (!character.combat.attackActive
                    && ctx.combatShotTimer <= 0
                    && adist <= rangedWeapon.range
                    && canStartAttack(character.combat, {dx: ndx, dz: ndz, holdDuration: 0, attackKey: 'light'})) {
                    if (aimAndFireAt(ctx, character, aimTarget, setInput) === 'firing') {
                        ctx.combatShotTimer = COMBAT_SHOT_INTERVAL
                    }
                    return
                }
            }
        }

        /* 射击动作进行中：站定不移动（明确的「射击」相位；朝向由 world 锁到目标） */
        if (character.combat.attackActive) {
            ctx.combatAimActive = true
            setInput(0, 0, false)
            return
        }

        /* 逃跑相位：面朝逃跑方向，持续拉开距离 */
        setInput(ctx.combatFleeDir.x, ctx.combatFleeDir.z, false)
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
                const detRange = character.combat.weapon.detectionRange
                const pos = character.body.translation()
                for (const other of allCharacters) {
                    if (other.id === character.id || other.combat.isDead) continue
                    if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue
                    const ox = other.body.translation().x - pos.x
                    const oz = other.body.translation().z - pos.z
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
                    const detRange = character.combat.weapon.detectionRange
                    const pos = character.body.translation()
                    let hasTarget = false
                    for (const other of allCharacters) {
                        if (other.id === character.id || other.combat.isDead) continue
                        if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue
                        if (Math.hypot(other.body.translation().x - pos.x, other.body.translation().z - pos.z) < detRange) {
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
                const detRange = character.combat.weapon.detectionRange
                const pos = character.body.translation()
                for (const other of allCharacters) {
                    if (other.id === character.id || other.combat.isDead) continue
                    if (!character.combat.attackTendency(character.combat.faction, other.combat.faction)) continue
                    if (Math.hypot(other.body.translation().x - pos.x, other.body.translation().z - pos.z) < detRange) {
                        return false
                    }
                }
                return true
            },
        },
    ],
}
