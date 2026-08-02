import {Vec3} from 'cannon-es'
import {Vector3} from 'three'
import type {CharacterEntity} from '../../../character/types.ts'
import type {SkillExecutor, ExecutorContext} from '../../../character/combat/executor.ts'
import type {SkillConfig} from '../../../character/combat/skill_types.ts'
import {applyDamage} from '../../../character/combat/damage.ts'
import type {CombatComponent} from '../../../character/combat/types.ts'
import type {CharacterModel} from '../appearance/types.ts'

const _tmpVec = new Vec3()
const _tmpVec3 = new Vector3()

/** 武器命中半径（覆盖武器半长 + 角色碰撞半径裕量） */
const WEAPON_HIT_RADIUS = 0.9

export const createMeleeExecutor = (
    getAllCharacters: () => readonly CharacterEntity[],
    getModel: (id: number) => CharacterModel | undefined,
): SkillExecutor => {
    const start = (
        _skill: SkillConfig,
        _combat: CombatComponent,
        _entity: CharacterEntity,
        _direction: Vec3,
        _ctx: ExecutorContext,
    ): void => {
        // 无需 body —— 命中检测基于武器模型的世界空间位置
    }

    const update = (
        _dt: number,
        skill: SkillConfig,
        combat: CombatComponent,
        entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        if (skill.type !== 'melee') return
        const model = getModel(entity.id)
        if (!model || !model.weaponMesh) return

        const duration = combat.skills[combat.currentSkillIndex]?.config.duration ?? 0.3
        const progress = combat.attackTimer / duration
        /* 在挥砍阶段（进度 0.1–0.85）检测命中，跳过蓄力前段和恢复末段 */
        if (progress < 0.1 || progress > 0.85) return

        model.weaponMesh.getWorldPosition(_tmpVec3)
        const wx = _tmpVec3.x
        const wy = _tmpVec3.y
        const wz = _tmpVec3.z

        const hitRadius = WEAPON_HIT_RADIUS + Math.max(0, skill.weapon.range - 1.2) * 0.2

        for (const target of getAllCharacters()) {
            if (target.id === entity.id) continue
            if (target.combat.isDead) continue
            if (combat.attackedTargets.has(target.id)) continue
            if (!combat.attackTendency(combat.faction, target.combat.faction)) continue

            const tPos = target.body.position
            const dx = tPos.x - wx
            const dy = (tPos.y - wy) * 0.3
            const dz = tPos.z - wz
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

            if (dist > hitRadius + target.config.radius) continue

            applyDamage(target.combat, {
                sourceId: entity.id,
                targetId: target.id,
                baseAmount: skill.weapon.damage,
                finalAmount: skill.weapon.damage,
                skillId: skill.id,
            })
            combat.attackedTargets.add(target.id)

            _tmpVec.set(tPos.x - wx, 0, tPos.z - wz)
            const len = _tmpVec.length()
            if (len > 0.0001) {
                _tmpVec.scale(1 / len, _tmpVec)
                target.body.applyImpulse(
                    new Vec3(_tmpVec.x * skill.weapon.knockbackForce, skill.weapon.knockbackY, _tmpVec.z * skill.weapon.knockbackForce),
                    target.body.position,
                )
            }
            target.body.wakeUp()
        }
    }

    const end = (
        _skill: SkillConfig,
        _combat: CombatComponent,
        _entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        // 无需清理
    }

    return {type: 'melee', start, update, end}
}
