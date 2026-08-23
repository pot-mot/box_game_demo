import {v3Set, type RapVector3} from '../../../physics/rapier_utils.ts'
import {Vector3} from 'three'
import type {CharacterEntity} from '../../../character/types.ts'
import type {SkillExecutor, ExecutorContext} from '../../../character/combat/executor.ts'
import type {SkillConfig} from '../../../character/combat/skill_types.ts'
import {applyDamage} from '../../../character/combat/damage.ts'
import type {CombatComponent} from '../../../character/combat/types.ts'
import {CHARACTER_BASE_SIZE} from '../constants.ts'
import {obbFromTransform, yawOBB, obbIntersect, type OBB, type Vec3Like} from './obb.ts'
import type {CharacterModel} from '../appearance/types.ts'
import type {MeleeDetectBox} from '../../../character/weapon/melee_weapon.ts'

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
 * 命中窗口由攻击动画事件轨道驱动（hitbox_on/off，见 attack_clips.ts），
 * 不再由状态机计时窗口控制 —— 窗口与视觉动画天然同步。
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
 * 攻击检测箱 OBB（AI 出招门控专用，与伤害判定箱解耦）：
 * 由近战武器的 detectBox 配置显式驱动（盒尺寸 + 相对身体中心偏移，
 * 局部 +Z = 朝向），按角色 scale 缩放并随角色 yaw 旋转到世界空间。
 */
export const attackDetectOBB = (
    pos: Vec3Like,
    detectBox: MeleeDetectBox,
    scale: number,
    yaw: number,
): OBB => {
    const ox = detectBox.offset.x * scale
    const oy = detectBox.offset.y * scale
    const oz = detectBox.offset.z * scale
    /* 局部偏移绕 Y 轴旋转 yaw（local +Z → (sin, 0, cos)） */
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    return yawOBB(
        pos.x + ox * cos + oz * sin,
        pos.y + oy,
        pos.z - ox * sin + oz * cos,
        detectBox.size.x * scale / 2,
        detectBox.size.y * scale / 2,
        detectBox.size.z * scale / 2,
        yaw,
    )
}

/** 攻击检测：检测箱 OBB 与目标受击箱 OBB 相交判定（AI 出招触发用） */
export const testAttackDetect = (
    charPos: Vec3Like,
    detectBox: MeleeDetectBox,
    scale: number,
    yaw: number,
    targetPos: Vec3Like,
    targetScale: number,
    targetYaw: number,
): boolean =>
    obbIntersect(
        attackDetectOBB(charPos, detectBox, scale, yaw),
        targetHurtOBB(targetPos, targetScale, targetYaw),
    )

/** 命中回调：参数为命中点世界坐标（供顿帧/相机震动等打击感系统消费） */
export type MeleeHitCallback = (x: number, y: number, z: number) => void

/** 近战执行器：命中窗口由攻击动画事件轨道驱动（setHitWindow），窗口内每帧 OBB SAT 判定 */
export interface MeleeExecutor extends SkillExecutor {
    setHitWindow: (active: boolean) => void
}

export const createMeleeExecutor = (
    getAllCharacters: () => readonly CharacterEntity[],
    getModel: (id: number) => CharacterModel | undefined,
    getFacingAngle: (id: number) => number,
    onHit?: MeleeHitCallback,
): MeleeExecutor => {
    /** 命中窗口状态：由攻击动画事件轨道（hitbox_on/off）开关 */
    let hitWindowActive = false

    const setHitWindow = (active: boolean): void => {
        hitWindowActive = active
    }

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
        /* 命中窗口关闭（动画事件轨 hitbox_off 或攻击尚未进入打击阶段）时不检测 */
        if (!hitWindowActive) return
        const model = getModel(entity.id)
        if (!model || !model.weaponGroup || !model.weaponHitBox) return

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

    return {type: 'melee', start, update, end, setHitWindow}
}
