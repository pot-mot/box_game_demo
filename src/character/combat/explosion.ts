import {Vec3} from 'cannon-es'
import type {CharacterEntity} from '../types.ts'
import {applyDamage} from './damage.ts'

const _dir = new Vec3()

/** 对爆炸半径内所有角色施加距离衰减伤害和径向击退 */
export const applyExplosionDamage = (
    centerX: number,
    centerY: number,
    centerZ: number,
    radius: number,
    damage: number,
    knockbackForce: number,
    sourceEntity: CharacterEntity,
    allCharacters: readonly CharacterEntity[],
): void => {
    for (const target of allCharacters) {
        if (target.id === sourceEntity.id || target.combat.isDead) continue
        if (!sourceEntity.combat.attackTendency(sourceEntity.combat.faction, target.combat.faction)) continue

        const tPos = target.body.position
        _dir.set(tPos.x - centerX, tPos.y - centerY, tPos.z - centerZ)
        const dist = _dir.length()
        if (dist > radius || dist < 0.0001) continue

        const falloff = 1 - dist / radius
        const dmg = Math.max(1, Math.ceil(damage * falloff))
        applyDamage(target.combat, {
            sourceId: sourceEntity.id,
            targetId: target.id,
            baseAmount: dmg,
            finalAmount: dmg,
            skillId: 'explosion',
        })

        const lenInv = 1 / dist
        const impulse = new Vec3(
            _dir.x * lenInv * knockbackForce * falloff,
            knockbackForce * falloff * 0.5,
            _dir.z * lenInv * knockbackForce * falloff,
        )
        target.body.applyImpulse(impulse, target.body.position)
        target.body.wakeUp()
    }
}
