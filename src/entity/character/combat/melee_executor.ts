import {v3Set, v3Length, type RapVector3} from '../../../physics/rapier_utils.ts'
import {Vector3} from 'three'
import type {CharacterEntity} from '../../../character/types.ts'
import type {SkillExecutor, ExecutorContext} from '../../../character/combat/executor.ts'
import type {SkillConfig} from '../../../character/combat/skill_types.ts'
import {applyDamage} from '../../../character/combat/damage.ts'
import type {CombatComponent} from '../../../character/combat/types.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'
import type {CharacterModel} from '../appearance/types.ts'

const _tmpVec: RapVector3 = {x: 0, y: 0, z: 0}
const _tmpVec3 = new Vector3()

/** 武器命中箱半长（XZ 平面） */
const WEAPON_HIT_BOX_HALF_XY = 0.7
/** 武器命中箱半高 = 武器 range × 此因子 */
const WEAPON_HIT_BOX_HALF_Y_FACTOR = 0.25
/** 受击箱尺寸倍率（角色碰撞半宽/半深 × 此值） */
const TARGET_HIT_BOX_RADIUS_FACTOR = 1.5
/** 受击箱高度倍率（角色碰撞半高 × 此值） */
const TARGET_HIT_BOX_HEIGHT_FACTOR = 1.1

/** 命中回调：参数为命中点世界坐标（供顿帧/相机震动等打击感系统消费） */
export type MeleeHitCallback = (x: number, y: number, z: number) => void

export const createMeleeExecutor = (
    getAllCharacters: () => readonly CharacterEntity[],
    getModel: (id: number) => CharacterModel | undefined,
    onHit?: MeleeHitCallback,
): SkillExecutor => {
    const start = (
        _skill: SkillConfig,
        _combat: CombatComponent,
        _entity: CharacterEntity,
        _direction: RapVector3,
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

        /* 武器命中箱半长 */
        const whw = WEAPON_HIT_BOX_HALF_XY
        const whh = skill.weapon.range * WEAPON_HIT_BOX_HALF_Y_FACTOR

        for (const target of getAllCharacters()) {
            if (target.id === entity.id) continue
            if (target.combat.isDead) continue
            if (combat.attackedTargets.has(target.id)) continue
            if (!combat.attackTendency(combat.faction, target.combat.faction)) continue

            const tTrans = target.body.translation()
            const tx = tTrans.x
            const ty = tTrans.y
            const tz = tTrans.z
            const tw = CHARACTER_BASE_SIZE.width * target.config.scale
            const td = CHARACTER_BASE_SIZE.depth * target.config.scale
            const th = CHARACTER_BASE_SIZE.height * target.config.scale
            const thw = tw / 2 * TARGET_HIT_BOX_RADIUS_FACTOR
            const thd = td / 2 * TARGET_HIT_BOX_RADIUS_FACTOR
            const thh = th / 2 * TARGET_HIT_BOX_HEIGHT_FACTOR

            /* AABB-AABB 重叠检测 */
            if (Math.abs(wx - tx) > whw + thw) continue
            if (Math.abs(wy - ty) > whh + thh) continue
            if (Math.abs(wz - tz) > whw + thd) continue

            applyDamage(target.combat, {
                sourceId: entity.id,
                targetId: target.id,
                baseAmount: skill.weapon.damage,
                finalAmount: skill.weapon.damage,
                skillId: skill.id,
            })
            combat.attackedTargets.add(target.id)
            onHit?.(wx, wy, wz)

            v3Set(_tmpVec, tx - wx, 0, tz - wz)
            const len = v3Length(_tmpVec)
            if (len > 0.0001) {
                _tmpVec.x /= len
                _tmpVec.z /= len
                target.body.applyImpulseAtPoint(
                    {
                        x: _tmpVec.x * skill.weapon.knockbackForce,
                        y: skill.weapon.knockbackY,
                        z: _tmpVec.z * skill.weapon.knockbackForce,
                    },
                    target.body.translation(),
                    true,
                )
            }
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
