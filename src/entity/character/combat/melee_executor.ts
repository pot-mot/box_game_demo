import {v3Set, type RapVector3} from '../../../physics/rapier_utils.ts'
import {Euler, Matrix4, Quaternion, Vector3, type Group} from 'three'
import type {CharacterEntity} from '../../../character/types.ts'
import type {SkillExecutor, ExecutorContext} from '../../../character/combat/executor.ts'
import {applyDamage, isDamageImmune} from '../../../character/combat/damage.ts'
import {downgradeImpact} from '../../../character/combat/impact.ts'
import type {CombatComponent} from '../../../character/combat/types.ts'
import type {CharacterConfig} from '../../../character/types.ts'
import type {ShieldCoverBox} from '../../../character/weapon/constants.ts'
import {formCenterOffsetY, formHurtHalf} from '../body_form/common/geometry.ts'
import {obbFromTransform, yawOBB, obbIntersect, type OBB, type Vec3Like} from './obb.ts'
import {obbIntersectsHurt} from './shapes.ts'
import type {CreatureModel} from '../appearance/types.ts'
import type {WeaponAttackBoxSpec} from '../../../character/weapon/mesh_config.ts'
import type {MeleeDetectBoxSpec, MeleeWeaponConfig} from '../../../character/weapon/melee_weapon.ts'
import type {WorldDamageTarget} from '../../../character/combat/world_targets.ts'

const _tmpVec: RapVector3 = {x: 0, y: 0, z: 0}
const _tmpVec3 = new Vector3()

/** 命中箱半长结构 */
export interface HitBoxHalves {
    readonly x: number
    readonly y: number
    readonly z: number
}

/** 目标受击箱半长：来自目标**体形** `size`（竖直包围盒），随身体朝向旋转 */
export const targetHitBoxHalves = (config: CharacterConfig): HitBoxHalves => formHurtHalf(config)

/** 目标受击箱 OBB（中心 = body 位置，随身体朝向 yaw 旋转） */
export const targetHurtOBB = (
    pos: Vec3Like,
    halves: HitBoxHalves,
    yaw: number,
): OBB => yawOBB(pos.x, pos.y, pos.z, halves.x, halves.y, halves.z, yaw)

/**
 * 盾遮挡体 OBB（世界空间）：由角色位置（body 中心）+ 朝向 + 盾 `cover` 几何 / 偏移计算，
 * 与 `world.ts` 的盾碰撞体同源（碰撞体用于子弹、此 OBB 用于近战 SAT）。
 * `cover` 偏移相对角色原点（脚底），故先将 body 中心还原到原点再叠加偏移。
 */
export const shieldCoverOBB = (
    pos: Vec3Like,
    config: CharacterConfig,
    yaw: number,
    cover: ShieldCoverBox,
): OBB => {
    const scale = config.scale
    const offsetZ = cover.offsetZ * scale
    const offsetY = cover.offsetY * scale
    const originY = pos.y - formCenterOffsetY(config)
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    return yawOBB(
        pos.x + sin * offsetZ,
        originY + offsetY,
        pos.z + cos * offsetZ,
        cover.width * scale / 2,
        cover.height * scale / 2,
        cover.depth * scale / 2,
        yaw,
    )
}

/**
 * 攻击判定：武器命中箱 OBB（由武器模型 matrixWorld 变换本地盒得到，随武器位置与姿态移动）
 * 与目标受击箱 OBB 相交检测。武器本地盒由武器构建时提供（略大于武器模型）。
 * 命中窗口由攻击动画事件轨道驱动（hitbox_on/off，见 attack_clips/），
 * 不再由状态机计时窗口控制 —— 窗口与视觉动画天然同步。
 */
export const testMeleeHit = (
    weaponMatrixElements: readonly number[],
    localCenter: Vec3Like,
    localHalf: Vec3Like,
    targetPos: Vec3Like,
    targetHalves: HitBoxHalves,
    targetYaw: number,
): boolean =>
    obbIntersect(
        obbFromTransform(weaponMatrixElements, localCenter, localHalf),
        targetHurtOBB(targetPos, targetHalves, targetYaw),
    )

/** 攻击检测箱 OBB（AI 出招门控专用）：由绑定骨骼节点的世界矩阵 + 局部偏移 / 旋转生成 */
const _detectMatrix = new Matrix4()
const _detectQuat = new Quaternion()
const _detectEuler = new Euler()
const _detectPos = new Vector3()
const _detectScale = new Vector3(1, 1, 1)
const _detectCombined = new Matrix4()
const _detectCenter = new Vector3()
const _detectRotation = new Quaternion()
const _detectAxes = new Matrix4()

export const attackDetectOBBFromJoint = (
    joint: Group,
    detectBox: MeleeDetectBoxSpec,
    scale: number,
): OBB => {
    joint.updateWorldMatrix(true, false)
    _detectEuler.set(detectBox.rotation.x, detectBox.rotation.y, detectBox.rotation.z, 'XYZ')
    _detectQuat.setFromEuler(_detectEuler)
    _detectMatrix.compose(
        _detectPos.set(detectBox.offset.x * scale, detectBox.offset.y * scale, detectBox.offset.z * scale),
        _detectQuat,
        _detectScale,
    )
    const combined = _detectCombined.multiplyMatrices(joint.matrixWorld, _detectMatrix)
    const center = _detectCenter.setFromMatrixPosition(combined)
    const quat = _detectRotation.setFromRotationMatrix(combined)
    const axes = _detectAxes.makeRotationFromQuaternion(quat).elements
    return {
        center: {x: center.x, y: center.y, z: center.z},
        axes: [
            {x: axes[0], y: axes[1], z: axes[2]},
            {x: axes[4], y: axes[5], z: axes[6]},
            {x: axes[8], y: axes[9], z: axes[10]},
        ],
        half: {
            x: detectBox.size.x * scale / 2,
            y: detectBox.size.y * scale / 2,
            z: detectBox.size.z * scale / 2,
        },
    }
}

/** 检测箱数组是否任一与目标受击箱相交 */
export const testAttackDetect = (
    jointGroups: ReadonlyMap<string, Group>,
    detectBoxes: readonly MeleeDetectBoxSpec[],
    scale: number,
    targetPos: Vec3Like,
    targetHalves: HitBoxHalves,
    targetYaw: number,
): boolean => {
    const target = targetHurtOBB(targetPos, targetHalves, targetYaw)
    for (const box of detectBoxes) {
        const joint = jointGroups.get(box.jointId)
        if (joint === undefined) continue
        if (obbIntersect(attackDetectOBBFromJoint(joint, box, scale), target)) return true
    }
    return false
}

/** 武器攻击箱世界 OBB：绑定关节矩阵 × 局部偏移 / 旋转 */
const _weaponMatrix = new Matrix4()
const _weaponQuat = new Quaternion()
const _weaponEuler = new Euler()
const _weaponPos = new Vector3()
const _weaponScale = new Vector3(1, 1, 1)
const _weaponCombined = new Matrix4()
const _weaponCenter = new Vector3()
const _weaponRotation = new Quaternion()
const _weaponAxes = new Matrix4()

export const attackBoxOBB = (joint: Group, box: WeaponAttackBoxSpec): OBB => {
    joint.updateWorldMatrix(true, false)
    _weaponEuler.set(box.rotation.x, box.rotation.y, box.rotation.z, 'XYZ')
    _weaponQuat.setFromEuler(_weaponEuler)
    _weaponMatrix.compose(
        _weaponPos.set(box.center.x, box.center.y, box.center.z),
        _weaponQuat,
        _weaponScale,
    )
    const combined = _weaponCombined.multiplyMatrices(joint.matrixWorld, _weaponMatrix)
    const center = _weaponCenter.setFromMatrixPosition(combined)
    const quat = _weaponRotation.setFromRotationMatrix(combined)
    const axes = _weaponAxes.makeRotationFromQuaternion(quat).elements
    const e = combined.elements
    const sx = Math.hypot(e[0], e[1], e[2]) || 1
    const sy = Math.hypot(e[4], e[5], e[6]) || 1
    const sz = Math.hypot(e[8], e[9], e[10]) || 1
    return {
        center: {x: center.x, y: center.y, z: center.z},
        axes: [
            {x: axes[0], y: axes[1], z: axes[2]},
            {x: axes[4], y: axes[5], z: axes[6]},
            {x: axes[8], y: axes[9], z: axes[10]},
        ],
        half: {x: box.half.x * sx, y: box.half.y * sy, z: box.half.z * sz},
    }
}

/** 命中回调：参数为命中点世界坐标（供顿帧/相机震动等打击感系统消费） */
export type MeleeHitCallback = (x: number, y: number, z: number) => void

/** 无受击子块时的兜底命中块 id */
const FALLBACK_HURT_BLOCK: readonly string[] = ['body']

/**
 * 武器 OBB 命中的受击子块 id 列表（无命中 = undefined）。
 * 有受击子块时逐块检定（可同时命中多块）；无子块时回退到旧的单一身体盒（返回 ['body']）。
 */
const hitHurtBlocksOf = (
    weaponOBB: OBB,
    target: CharacterEntity,
    getFacingAngle: (id: number) => number,
): readonly string[] | undefined => {
    const blocks = target.state.hurtBlocks
    if (blocks !== undefined && blocks.length > 0) {
        let hit: string[] | undefined
        for (const b of blocks) {
            if (obbIntersectsHurt(weaponOBB, b)) {
                if (hit === undefined) hit = []
                hit.push(b.id)
            }
        }
        return hit
    }
    const t = target.body.translation()
    return obbIntersect(weaponOBB, targetHurtOBB(t, targetHitBoxHalves(target.state.config), getFacingAngle(target.state.identity.id)))
        ? FALLBACK_HURT_BLOCK
        : undefined
}

/** 近战命中窗口按武器槽（`kind:bodyPart` 或体形部位 id）独立开关 */
export interface MeleeExecutor extends SkillExecutor {
    /** 开关命中窗口；slotKey 缺省 = 同时作用于全部已装备武器槽 */
    setHitWindow: (active: boolean, slotKey?: string) => void
}

export const createMeleeExecutor = (
    getAllCharacters: () => readonly CharacterEntity[],
    getModel: (id: number) => CreatureModel | undefined,
    getFacingAngle: (id: number) => number,
    onHit?: MeleeHitCallback,
    getWorldTargets?: () => readonly WorldDamageTarget[],
): MeleeExecutor => {
    /** 命中窗口状态：默认窗口（事件未指定槽位）+ 逐槽位独立窗口 */
    let defaultWindowActive = false
    const slotWindows = new Map<string, boolean>()

    /** 槽位键归一化为武器表键（bodyPart；兼容 `weapon:main_hand` 形式） */
    const bodyPartOfSlot = (slotKey: string): string => slotKey.startsWith('weapon:') ? slotKey.slice('weapon:'.length) : slotKey

    const setHitWindow = (active: boolean, slotKey?: string): void => {
        if (slotKey === undefined) {
            defaultWindowActive = active
            slotWindows.clear()
            return
        }
        slotWindows.set(bodyPartOfSlot(slotKey), active)
    }

    const start = (
        _combat: CombatComponent,
        _entity: CharacterEntity,
        _direction: RapVector3,
        _ctx: ExecutorContext,
    ): void => {
        // 无需 body —— 命中检测基于武器模型的世界空间 OBB
    }

    const update = (
        _dt: number,
        combat: CombatComponent,
        entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        const activeSegment = combat.activeSegment
        const weapon = activeSegment !== undefined && combat.attackWeapons?.has(activeSegment.id) === true
            ? (combat.activeWeapon ?? combat.weapon)
            : combat.weapon
        if (weapon.type !== 'melee') return
        /* 命中窗口全部关闭（动画事件轨 hitbox_off 或攻击尚未进入打击阶段）时不检测 */
        if (!defaultWindowActive && ![...slotWindows.values()].some(Boolean)) return
        const model = getModel(entity.state.identity.id)
        if (!model) return

        const attackId = combat.activeSegment?.id ?? weapon.id

        /**
         * 用单个武器（主手 / 副手）的命中箱与数值做一次判定：
         * 伤害 = (该武器基础伤害 + 装备攻击加成，与武器类别匹配) × 当前段伤害倍率（重段 ×1.6）。
         * 双持时副手命中按**副手武器**结算（同类武器，数值可能因模型覆写不同）；每段每目标只结算一次。
         */
        const strikeBox = (joint: Group, box: WeaponAttackBoxSpec, slotWeapon: MeleeWeaponConfig): void => {
            const segment = combat.activeSegment
            /* 蓄力重击：命中时按蓄力值连续放大伤害（chargeDamageBonus 为满蓄力加成，普通段为 0） */
            const damage = (slotWeapon.damage + combat.attackBonus[slotWeapon.damageType])
                * (segment?.damageMultiplier ?? 1)
                * (1 + combat.attackCharge * (segment?.chargeDamageBonus ?? 0))
            /* matrixWorld 在渲染器绘制前可能滞后，先强制刷新绑定关节子树变换 */
            const weaponOBB = attackBoxOBB(joint, box)
            const wPos = joint.getWorldPosition(_tmpVec3)
            const wx = wPos.x
            const wy = wPos.y
            const wz = wPos.z

            for (const target of getAllCharacters()) {
                if (target.state.identity.id === entity.state.identity.id) continue
                if (target.state.combat.isDead) continue
                if (combat.attackedTargets.has(target.state.identity.id)) continue
                if (!combat.attackTendency(combat.faction, target.state.combat.faction)) continue

                const tTrans = target.body.translation()
                const tx = tTrans.x
                const tz = tTrans.z

                const hitBlocks = hitHurtBlocksOf(weaponOBB, target, getFacingAngle)
                if (hitBlocks === undefined) continue

                /* 翻滚无敌帧：不算命中 —— 不写 attackedTargets、不击退、不触发打击反馈（顿帧/震动）；
                 * 无敌结束后只要仍在命中窗口内，同一段仍可命中该目标 */
                if (isDamageImmune(target.state.combat)) continue

                /* 冲击方向 = 武器握把 → 目标（水平）：伤害事件携带（死亡倒向依据）并与击退共用 */
                v3Set(_tmpVec, tx - wx, 0, tz - wz)
                const len = Math.hypot(_tmpVec.x, _tmpVec.z)
                const hasDir = len > 0.0001
                const dirX = hasDir ? _tmpVec.x / len : 0
                const dirZ = hasDir ? _tmpVec.z / len : 0

                /* 盾格挡：目标举盾且未破防、武器命中箱与盾遮挡体相交 → 减免结算（不进行全额结算） */
                const block = target.state.combat.block
                if (block !== undefined && target.state.combat.blocking && target.state.combat.guard > 0
                    && obbIntersect(
                        weaponOBB,
                        shieldCoverOBB(tTrans, target.state.config, getFacingAngle(target.state.identity.id), block.cover),
                    )) {
                    const blockedDamage = damage * block.blockDamageMultiplier
                    const incomingImpact = segment?.impact ?? 'light'
                    applyDamage(target.state.combat, {
                        sourceId: entity.state.identity.id,
                        targetId: target.state.identity.id,
                        damageType: slotWeapon.damageType,
                        baseAmount: blockedDamage,
                        finalAmount: blockedDamage,
                        skillId: attackId,
                        /* knockdown 击穿格挡不降级，其余降一级 */
                        impact: incomingImpact === 'knockdown' ? incomingImpact : downgradeImpact(incomingImpact),
                        poiseDamage: (segment?.poiseDamage ?? 0) * block.poiseMultiplier,
                        hitHurtBlocks: hitBlocks,
                        ...(hasDir ? {dirX, dirZ} : {}),
                    })
                    target.state.combat.guard = Math.max(0, target.state.combat.guard - blockedDamage)
                    combat.attackedTargets.add(target.state.identity.id)
                    onHit?.(wx, wy, wz)
                    if (hasDir) {
                        const kb = slotWeapon.knockbackForce * block.blockKnockbackMultiplier
                        target.body.applyImpulseAtPoint(
                            {x: dirX * kb, y: slotWeapon.knockbackY, z: dirZ * kb},
                            target.body.translation(),
                            true,
                        )
                    }
                    continue
                }

                applyDamage(target.state.combat, {
                    sourceId: entity.state.identity.id,
                    targetId: target.state.identity.id,
                    damageType: slotWeapon.damageType,
                    baseAmount: damage,
                    finalAmount: damage,
                    skillId: attackId,
                    /* 冲击力 / 削韧来自当前攻击段（无段时按轻冲击、不削韧回退） */
                    impact: segment?.impact ?? 'light',
                    poiseDamage: segment?.poiseDamage ?? 0,
                    hitHurtBlocks: hitBlocks,
                    ...(hasDir ? {dirX, dirZ} : {}),
                })
                combat.attackedTargets.add(target.state.identity.id)
                onHit?.(wx, wy, wz)

                if (hasDir) {
                    target.body.applyImpulseAtPoint(
                        {
                            x: dirX * slotWeapon.knockbackForce,
                            y: slotWeapon.knockbackY,
                            z: dirZ * slotWeapon.knockbackForce,
                        },
                        target.body.translation(),
                        true,
                    )
                }
            }

            /* 世界受击目标（可破坏道具）：按来源类别过滤，返回是否消费由目标决定 */
            const worldTargets = getWorldTargets?.()
            if (worldTargets !== undefined) {
                for (const wt of worldTargets) {
                    if (wt.dead) continue
                    if (combat.attackedTargets.has(wt.key)) continue
                    if (!obbIntersect(
                        weaponOBB,
                        yawOBB(wt.x, wt.y, wt.z, wt.hx, wt.hy, wt.hz, wt.yaw),
                    )) continue

                    v3Set(_tmpVec, wt.x - wx, 0, wt.z - wz)
                    const wlen = Math.hypot(_tmpVec.x, _tmpVec.z)
                    const whasDir = wlen > 0.0001
                    const wdirX = whasDir ? _tmpVec.x / wlen : 0
                    const wdirZ = whasDir ? _tmpVec.z / wlen : 0
                    if (wt.onAttacked('melee', slotWeapon.damageType, damage, wdirX, wdirZ)) {
                        combat.attackedTargets.add(wt.key)
                        onHit?.(wx, wy, wz)
                    }
                }
            }
        }

        /** 某槽位的命中窗口是否开启（默认窗口对所有已装备槽生效） */
        const windowActiveOf = (slotKey: string): boolean => defaultWindowActive || slotWindows.get(slotKey) === true

        /** 解析槽位对应的武器运行时 / 攻击箱数组（无该槽位数据时回退主武器） */
        const strikeSlot = (slotKey: string): void => {
            if (!windowActiveOf(slotKey)) return
            if (slotKey === 'off_hand') {
                /* 双手共持：副手只作为支撑手握主武器，副手武器攻击箱不得参与命中 */
                if (combat.attackModules.get(combat.attackModule)?.def.holdMode === 'two_handed') return
                const offhand = combat.weapons.get('off_hand')?.weapon ?? combat.offhand?.weapon
                const offhandWeapon = offhand !== undefined && offhand.type === 'melee' ? offhand : weapon
                for (const box of model.offhandWeaponAttackBoxes ?? []) {
                    const joint = model.jointGroups?.get(box.jointId) ?? model.offhandWeaponGroup
                    if (joint !== undefined && joint !== null) strikeBox(joint, box, offhandWeapon)
                }
                return
            }
            const slotRuntime = combat.weapons.get(slotKey)
            const slotWeapon = slotRuntime !== undefined && slotRuntime.weapon.type === 'melee' ? slotRuntime.weapon : weapon
            const mountIds = combat.activeSegment?.hitMountJointIds
            const allowed = mountIds !== undefined && mountIds.length > 0 ? new Set(mountIds) : undefined
            let boxes = model.weaponAttackBoxes
            if (allowed !== undefined) {
                const filtered = boxes.filter(box => allowed.has(box.jointId))
                if (filtered.length > 0) boxes = filtered
            }
            for (const box of boxes) {
                const joint = model.jointGroups?.get(box.jointId) ?? model.weaponGroup
                if (joint !== undefined && joint !== null) strikeBox(joint, box, slotWeapon)
            }
        }

        const slotKeys = new Set<string>(['main_hand', 'off_hand', ...combat.weapons.keys(), ...slotWindows.keys()])
        for (const slotKey of slotKeys) strikeSlot(slotKey)
    }

    const end = (
        _combat: CombatComponent,
        _entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        // 无需清理
    }

    return {type: 'melee', start, update, end, setHitWindow}
}
