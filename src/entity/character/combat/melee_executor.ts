import {v3Set, type RapVector3} from '../../../physics/rapier_utils.ts'
import {Vector3} from 'three'
import type {CharacterEntity} from '../../../character/types.ts'
import type {SkillExecutor, ExecutorContext} from '../../../character/combat/executor.ts'
import type {SkillConfig} from '../../../character/combat/skill_types.ts'
import {applyDamage} from '../../../character/combat/damage.ts'
import type {CombatComponent} from '../../../character/combat/types.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'
import {
    ATTACK_DETECT_SIDE_MARGIN,
    ATTACK_DETECT_HEIGHT_MARGIN,
    ATTACK_DETECT_BACK_MARGIN,
    MELEE_ARM_FORWARD_REACH,
    ATTACK_DETECT_REACH_MARGIN,
} from './constants.ts'
import {obbFromTransform, yawOBB, obbIntersect, type OBB, type Vec3Like} from './obb.ts'
import type {CharacterModel} from '../appearance/types.ts'

const _tmpVec: RapVector3 = {x: 0, y: 0, z: 0}
const _tmpVec3 = new Vector3()

/** 命中箱半长结构 */
export interface HitBoxHalves {
    readonly x: number
    readonly y: number
    readonly z: number
}

/** 目标受击箱半长：与碰撞箱同尺寸（竖直胶囊包围盒），随身体朝向旋转 */
export const targetHitBoxHalves = (scale: number): HitBoxHalves => ({
    x: CHARACTER_BASE_SIZE.width * scale / 2,
    y: CHARACTER_BASE_SIZE.height * scale / 2,
    z: CHARACTER_BASE_SIZE.depth * scale / 2,
})

/** 目标受击箱 OBB（中心 = body 位置，随身体朝向 yaw 旋转） */
export const targetHurtOBB = (
    pos: Vec3Like,
    scale: number,
    yaw: number,
): OBB => {
    const th = targetHitBoxHalves(scale)
    return yawOBB(pos.x, pos.y, pos.z, th.x, th.y, th.z, yaw)
}

/**
 * 攻击判定：武器命中箱 OBB（由武器模型 matrixWorld 变换本地盒得到，随武器位置与姿态移动）
 * 与目标受击箱 OBB 相交检测。武器本地盒由武器构建时提供（略大于武器模型）。
 */
export const testMeleeHit = (
    weaponMatrixElements: readonly number[],
    localCenter: Vec3Like,
    localHalf: Vec3Like,
    targetPos: Vec3Like,
    targetScale: number,
    targetYaw: number,
): boolean =>
    obbIntersect(
        obbFromTransform(weaponMatrixElements, localCenter, localHalf),
        targetHurtOBB(targetPos, targetScale, targetYaw),
    )

/**
 * 近战攻击检测深度（身体中心 → 检测箱前缘）：由武器实际打击距离驱动 ——
 * 持械臂前伸量 + 武器命中箱沿武器轴的前伸量（weaponHitBox.reach，与红色判定箱同源），
 * 另加少量触发余量。不再使用 weapon.range（其与实际命中距离差距过大）。
 */
export const meleeDetectRange = (weaponReach: number, scale: number): number =>
    (MELEE_ARM_FORWARD_REACH + weaponReach + ATTACK_DETECT_REACH_MARGIN) * scale

/**
 * 攻击检测箱 OBB（AI 出招门控专用，与伤害判定箱解耦）：
 * 与角色位置/朝向绑定，覆盖身体前方（深度 = meleeDetectRange 推导的武器实际打击距离）
 * 与两侧（宽度 = 身体碰撞箱宽 + 边距），略大于身体碰撞箱。
 * 深度随武器命中箱 reach 变化 —— 不同武器的攻击距离差异由此自然表达。
 */
export const attackDetectOBB = (
    pos: Vec3Like,
    range: number,
    scale: number,
    yaw: number,
): OBB => {
    const bw = CHARACTER_BASE_SIZE.width * scale / 2
    const bh = CHARACTER_BASE_SIZE.height * scale / 2
    const bd = CHARACTER_BASE_SIZE.depth * scale / 2
    /* 本地（forward = +Z）：z ∈ [-bd - back, range]，覆盖前方与贴背目标；
     * 盒中心前移 centerZ，经 yaw 旋转到世界空间（local +Z → (sin, 0, cos)） */
    const halfZ = (range + bd + ATTACK_DETECT_BACK_MARGIN) / 2
    const centerZ = (range - bd - ATTACK_DETECT_BACK_MARGIN) / 2
    return yawOBB(
        pos.x + Math.sin(yaw) * centerZ,
        pos.y,
        pos.z + Math.cos(yaw) * centerZ,
        bw + ATTACK_DETECT_SIDE_MARGIN,
        bh + ATTACK_DETECT_HEIGHT_MARGIN,
        halfZ,
        yaw,
    )
}

/** 攻击检测：检测箱 OBB 与目标受击箱 OBB 相交判定（AI 出招触发用） */
export const testAttackDetect = (
    charPos: Vec3Like,
    range: number,
    scale: number,
    yaw: number,
    targetPos: Vec3Like,
    targetScale: number,
    targetYaw: number,
): boolean =>
    obbIntersect(
        attackDetectOBB(charPos, range, scale, yaw),
        targetHurtOBB(targetPos, targetScale, targetYaw),
    )

/** 命中回调：参数为命中点世界坐标（供顿帧/相机震动等打击感系统消费） */
export type MeleeHitCallback = (x: number, y: number, z: number) => void

export const createMeleeExecutor = (
    getAllCharacters: () => readonly CharacterEntity[],
    getModel: (id: number) => CharacterModel | undefined,
    getFacingAngle: (id: number) => number,
    onHit?: MeleeHitCallback,
): SkillExecutor => {
    const start = (
        _skill: SkillConfig,
        _combat: CombatComponent,
        _entity: CharacterEntity,
        _direction: RapVector3,
        _ctx: ExecutorContext,
    ): void => {
        // 无需 body —— 命中检测基于武器模型的世界空间 OBB
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
        if (!model || !model.weaponGroup || !model.weaponHitBox) return

        const duration = combat.skills[combat.currentSkillIndex]?.config.duration ?? 0.3
        const progress = combat.attackTimer / duration
        /* duration = 动作时间（不含恢复）：在挥砍动作阶段（进度 0.1–0.85）检测命中，
         * 跳过蓄力前段；恢复期内 attackTimer > duration，progress 越界自然跳过 */
        if (progress < 0.1 || progress > 0.85) return

        /* matrixWorld 在渲染器绘制前可能滞后，先强制刷新武器子树变换 */
        model.weaponGroup.updateMatrixWorld()
        const elements = model.weaponGroup.matrixWorld.elements
        const local = model.weaponHitBox
        const wPos = model.weaponGroup.getWorldPosition(_tmpVec3)
        const wx = wPos.x
        const wy = wPos.y
        const wz = wPos.z

        for (const target of getAllCharacters()) {
            if (target.id === entity.id) continue
            if (target.combat.isDead) continue
            if (combat.attackedTargets.has(target.id)) continue
            if (!combat.attackTendency(combat.faction, target.combat.faction)) continue

            const tTrans = target.body.translation()
            const tx = tTrans.x
            const tz = tTrans.z

            if (!testMeleeHit(elements, local.center, local.half, tTrans, target.config.scale, getFacingAngle(target.id))) continue

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
            const len = Math.hypot(_tmpVec.x, _tmpVec.z)
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
