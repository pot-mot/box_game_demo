import {v3Set, v3Length, type RapVector3} from '../../physics/rapier_utils.ts'
import type {CharacterEntity} from '../types.ts'
import {applyDamage} from './damage.ts'

const _dir: RapVector3 = {x: 0, y: 0, z: 0}

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

        const tPos = target.body.translation()
        v3Set(_dir, tPos.x - centerX, tPos.y - centerY, tPos.z - centerZ)
        const dist = v3Length(_dir)
        if (dist > radius || dist < 0.0001) continue

        const falloff = 1 - dist / radius
        const dmg = Math.max(1, Math.ceil(damage * falloff))
        /* 冲击方向 = 爆心 → 目标（水平）：伤害事件携带（死亡倒向依据） */
        const hLen = Math.hypot(_dir.x, _dir.z)
        const hasDir = hLen > 0.0001
        applyDamage(target.combat, {
            sourceId: sourceEntity.id,
            targetId: target.id,
            baseAmount: dmg,
            finalAmount: dmg,
            skillId: 'explosion',
            ...(hasDir ? {dirX: _dir.x / hLen, dirZ: _dir.z / hLen} : {}),
        })

        const lenInv = 1 / dist
        target.body.applyImpulseAtPoint(
            {
                x: _dir.x * lenInv * knockbackForce * falloff,
                y: knockbackForce * falloff * 0.5,
                z: _dir.z * lenInv * knockbackForce * falloff,
            },
            target.body.translation(),
            true,
        )
    }
}
