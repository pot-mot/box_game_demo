import RAPIER from '@dimforge/rapier3d-compat'
import {Mesh, MeshBasicMaterial, SphereGeometry, type Scene} from 'three'
import {v3Set, v3Length, type RapVector3, type RapQuaternion} from '../../../physics/rapier_utils.ts'
import {createColliderForBody, setBodyMass} from '../../../physics/rapier_utils.ts'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {SkillExecutor, ExecutorContext} from '../../../character/combat/executor.ts'
import type {CombatComponent} from '../../../character/combat/types.ts'
import type {DamageType} from '../../../character/combat/damage_type.ts'
import {applyDamage, isDamageImmune} from '../../../character/combat/damage.ts'
import {applyExplosionDamage} from '../../../character/combat/explosion.ts'
import {resolvePhases} from '../../../character/combat/attack_phases.ts'
import type {WorldDamageTarget} from '../../../character/combat/world_targets.ts'
import {DEFAULT_BULLET_PASS_THROUGH_CATEGORIES, type RangedWeaponConfig} from '../../../character/weapon/ranged_weapon.ts'
import {
    collisionCategoryMask,
    isBlockingGeometry,
    maskIncludesCategory,
    matchesCategoryMask,
} from '../../../physics/collision_category.ts'
import {BULLET_SIZE, BULLET_COLLISION_GROUP, BULLET_COLLISION_MASK, BULLET_HIT_RADIUS} from './constants.ts'

const BULLET_GEOMETRY = new SphereGeometry(0.08, 4, 4)
const BULLET_MATERIAL_POOL = new Map<number, MeshBasicMaterial>()

/** 子弹恒不旋转：形状扫描使用恒等旋转 */
const IDENTITY_ROTATION: RapQuaternion = {x: 0, y: 0, z: 0, w: 1}

/** 形状扫描的复用入参（避免逐帧分配） */
const _sweepOrigin: RapVector3 = {x: 0, y: 0, z: 0}
const _sweepVelocity: RapVector3 = {x: 0, y: 0, z: 0}

interface BulletInstance {
    body: RAPIER.RigidBody
    collider: RAPIER.Collider
    mesh: Mesh
    ownerId: number
    ownerFaction: number
    ownerAttackTendency: import('../../../character/faction.ts').AttackTendency
    damage: number
    /** 攻击类别（创建子弹时取自武器）：直击与爆炸伤害均按此类别结算防御 */
    damageType: DamageType
    knockbackForce: number
    lifetime: number
    homingStrength: number
    explosionRadius: number
    /** 可穿过类别的位掩码（命中这些类别继续飞行） */
    passThroughMask: number
    /** 上一帧位置 —— 形状扫描起点（逐帧覆盖，避免每帧分配向量） */
    prevX: number
    prevY: number
    prevZ: number
}

const _tmpVec: RapVector3 = {x: 0, y: 0, z: 0}

/** 当前段阶段名（无段/阶段用尽时 undefined；开火门控用） */
const activePhaseName = (combat: CombatComponent): string | undefined => {
    const segment = combat.activeSegment
    if (segment === undefined) return undefined
    const phases = resolvePhases(segment.phases)
    return combat.phaseIndex < phases.length ? phases[combat.phaseIndex].name : undefined
}

const getPlayerFactionMaterial = (faction: number): MeshBasicMaterial => {
    let mat = BULLET_MATERIAL_POOL.get(faction)
    if (!mat) {
        const hue = (faction * 137) % 360
        mat = new MeshBasicMaterial({color: `hsl(${hue}, 80%, 55%)`})
        BULLET_MATERIAL_POOL.set(faction, mat)
    }
    return mat
}

/**
 * 形状扫描过滤：是否为「会挡下子弹」的碰撞体。
 * 1. 落在可穿过类别掩码内 → 放行（子弹穿过）；
 * 2. 其它已标注类别的场景几何（箱子 / 碎片 / 地形 / 世界地面）→ 阻挡；
 * 3. 角色类别与未标注类别的碰撞体（武器、其它子弹）→ 不参与扫描（角色另走宽容半径判定）。
 */
const blocksBullet = (collider: RAPIER.Collider, passThroughMask: number): boolean => {
    const groups = collider.collisionGroups()
    if (matchesCategoryMask(groups, passThroughMask)) return false
    return isBlockingGeometry(groups)
}

export const createRangedExecutor = (
    shared: SharedWorld,
    scene: Scene,
    getWorldTargets?: () => readonly WorldDamageTarget[],
): SkillExecutor & {
    updateBullets: (dt: number, allCharacters: readonly CharacterEntity[]) => void
    getBulletCount: () => number
    clear: () => void
} => {
    const {world} = shared
    const bullets: BulletInstance[] = []
    const firedThisAttack = new Set<number>()
    /* 形状扫描形状（半径 = 子弹碰撞体半径）：与物理/视觉尺寸同源，避免命中判定漂移 */
    const bulletShape = new RAPIER.Ball(BULLET_SIZE)

    const fireBulletInternal = (
        character: CharacterEntity,
        direction: RapVector3,
        weapon: RangedWeaponConfig,
        throwAngle: number,
    ): void => {
        const spawnPos = character.body.translation()
        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(
                spawnPos.x + direction.x * 0.5,
                spawnPos.y + 0.3,
                spawnPos.z + direction.z * 0.5,
            )
            .setLinearDamping(0)
        const body = world.createRigidBody(bodyDesc)

        const colliderDesc = RAPIER.ColliderDesc.ball(BULLET_SIZE)
            .setRestitution(0)
            /* 密度 0：子弹质量 = 附加质量 0.01（对齐 cannon-es master） */
            .setDensity(0)
            .setCollisionGroups((BULLET_COLLISION_GROUP << 16) | (BULLET_COLLISION_MASK & 0xFFFF))
            .setSensor(true)
        const collider = createColliderForBody(world, colliderDesc, body)
        setBodyMass(body, 0.01)

        const hSpeed = weapon.projectileSpeed * Math.cos(throwAngle)
        const vSpeed = weapon.projectileSpeed * Math.sin(throwAngle)
        body.setLinvel({x: direction.x * hSpeed, y: vSpeed, z: direction.z * hSpeed}, true)

        const material = getPlayerFactionMaterial(character.combat.faction)
        const mesh = new Mesh(BULLET_GEOMETRY, material)
        const bt = body.translation()
        mesh.position.set(bt.x, bt.y, bt.z)
        scene.add(mesh)

        bullets.push({
            body,
            collider,
            mesh,
            ownerId: character.id,
            ownerFaction: character.combat.faction,
            ownerAttackTendency: character.combat.attackTendency,
            /* 伤害 = 武器基础伤害 + 装备攻击加成（与武器类别匹配）；爆炸伤害继承该值 */
            damage: weapon.damage + character.combat.attackBonus[weapon.damageType],
            damageType: weapon.damageType,
            knockbackForce: weapon.knockbackForce,
            lifetime: weapon.projectileLifetime,
            homingStrength: weapon.homingStrength ?? 0,
            explosionRadius: weapon.explosionRadius ?? 0,
            passThroughMask: collisionCategoryMask(
                weapon.passThroughCategories ?? DEFAULT_BULLET_PASS_THROUGH_CATEGORIES,
            ),
            prevX: bt.x,
            prevY: bt.y,
            prevZ: bt.z,
        })
    }

    const attackDirections = new Map<number, {dx: number; dz: number}>()

    const start = (
        _combat: CombatComponent,
        entity: CharacterEntity,
        direction: RapVector3,
        _ctx: ExecutorContext,
    ): void => {
        firedThisAttack.delete(entity.id)
        attackDirections.set(entity.id, {dx: direction.x, dz: direction.z})
    }

    const update = (
        _dt: number,
        combat: CombatComponent,
        entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        const weapon = combat.weapon
        if (weapon.type !== 'ranged') return

        /* 开火时机 = release 阶段开始（与动画释放姿态对齐）：先拉弓/举枪，释放帧才出弹 */
        if (firedThisAttack.has(entity.id) || activePhaseName(combat) !== 'release') return
        firedThisAttack.add(entity.id)

        /* 弹道初始方向 = 武器实际朝向（world 每帧从武器骨骼采样的 muzzleDir），
         * 而非起手时记录的瞄准方向——角色未转身时枪口朝哪就朝哪，不会凭空射向目标。
         * 无武器朝向数据（无外观模型 / 测试）时回退到段起手记录的瞄准方向。 */
        const dir = attackDirections.get(entity.id)
        const muzzleReady = Math.hypot(combat.muzzleDirX, combat.muzzleDirZ) > 0.001
        const ndx = muzzleReady ? combat.muzzleDirX : (dir?.dx ?? combat.attackDirX)
        const ndz = muzzleReady ? combat.muzzleDirZ : (dir?.dz ?? combat.attackDirZ)
        const dirLen = Math.hypot(ndx, ndz)
        const fixedDx = dirLen < 0.001 ? 0 : ndx / dirLen
        const fixedDz = dirLen < 0.001 ? 1 : ndz / dirLen

        const w = weapon
        const throwAngle = w.throwAngle ?? 0
        const spreadCount = w.spreadCount ?? 1

        if (spreadCount > 1) {
            const halfSpread = (w.spreadAngle ?? 0) / 2
            for (let i = 0; i < spreadCount; i++) {
                const offset = spreadCount === 1 ? 0
                    : -halfSpread + (i / (spreadCount - 1)) * halfSpread * 2
                const cosOff = Math.cos(offset)
                const sinOff = Math.sin(offset)
                const px = fixedDx * cosOff - fixedDz * sinOff
                const pz = fixedDx * sinOff + fixedDz * cosOff
                v3Set(_tmpVec, px, 0, pz)
                fireBulletInternal(entity, _tmpVec, w, throwAngle)
            }
        } else {
            v3Set(_tmpVec, fixedDx, 0, fixedDz)
            fireBulletInternal(entity, _tmpVec, w, throwAngle)
        }
    }

    const end = (
        _combat: CombatComponent,
        entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        attackDirections.delete(entity.id)
    }

    const removeBullet = (idx: number): void => {
        const bullet = bullets[idx]
        world.removeRigidBody(bullet.body)
        bullet.mesh.removeFromParent()
        bullets.splice(idx, 1)
    }

    const getOwnerEntity = (ownerId: number, allCharacters: readonly CharacterEntity[]): CharacterEntity | undefined =>
        allCharacters.find(c => c.id === ownerId)

    /** 消失前结算范围伤害（爆炸半径 0 的子弹为空操作） */
    const detonateAt = (
        bullet: BulletInstance,
        x: number,
        y: number,
        z: number,
        allCharacters: readonly CharacterEntity[],
    ): void => {
        if (bullet.explosionRadius <= 0) return
        const owner = getOwnerEntity(bullet.ownerId, allCharacters)
        if (!owner) return
        applyExplosionDamage(
            x, y, z,
            bullet.explosionRadius, bullet.damage, bullet.damageType, bullet.knockbackForce,
            owner, allCharacters, getWorldTargets?.() ?? [],
        )
    }

    const updateBullets = (dt: number, allCharacters: readonly CharacterEntity[]): void => {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i]
            bullet.lifetime -= dt

            const bulletPos = bullet.body.translation()

            if (bullet.lifetime <= 0 || bulletPos.y < -10 || (bullet.explosionRadius > 0 && bulletPos.y < 0)) {
                detonateAt(bullet, bulletPos.x, bulletPos.y, bulletPos.z, allCharacters)
                removeBullet(i)
                continue
            }

            if (bullet.homingStrength > 0) {
                let nearestDist = Infinity
                let nearestDx = 0
                let nearestDz = 0
                for (const target of allCharacters) {
                    if (target.id === bullet.ownerId || target.combat.isDead) continue
                    if (!bullet.ownerAttackTendency(bullet.ownerFaction, target.combat.faction)) continue
                    const tp = target.body.translation()
                    const dx = tp.x - bulletPos.x
                    const dy = tp.y - bulletPos.y
                    const dz = tp.z - bulletPos.z
                    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
                    if (d < nearestDist) {
                        nearestDist = d
                        nearestDx = dx
                        nearestDz = dz
                    }
                }
                if (nearestDist < 15) {
                    const lv = bullet.body.linvel()
                    const speed = Math.sqrt(lv.x * lv.x + lv.z * lv.z)
                    if (nearestDist > 0.0001 && speed > 0.1) {
                        const invLen = 1 / nearestDist
                        const targetDX = nearestDx * invLen
                        const targetDZ = nearestDz * invLen
                        const currentDX = lv.x / speed
                        const currentDZ = lv.z / speed
                        bullet.body.setLinvel(
                            {
                                x: lv.x + (targetDX - currentDX) * bullet.homingStrength * speed * dt * 4,
                                y: lv.y,
                                z: lv.z + (targetDZ - currentDZ) * bullet.homingStrength * speed * dt * 4,
                            },
                            true,
                        )
                    }
                }
            }

            bullet.mesh.position.set(bulletPos.x, bulletPos.y, bulletPos.z)

            /* 1) 角色命中 —— 沿用宽容半径判定（角色类别不参与形状扫描）。
             * 命中角色即消失（角色不在可穿过类别内时）；仅敌对阵营结算伤害 / 击退 / 爆炸；
             * 翻滚无敌目标视为穿过（不消耗、不结算，可命中其后目标） */
            let hit = false
            if (!maskIncludesCategory(bullet.passThroughMask, 'character')) {
                for (const target of allCharacters) {
                    if (target.id === bullet.ownerId || target.combat.isDead) continue

                    const tp = target.body.translation()
                    v3Set(_tmpVec,
                        bulletPos.x - tp.x,
                        bulletPos.y - tp.y,
                        bulletPos.z - tp.z,
                    )
                    const dist = v3Length(_tmpVec)
                    if (dist > BULLET_HIT_RADIUS) continue

                    if (bullet.ownerAttackTendency(bullet.ownerFaction, target.combat.faction)) {
                        /* 翻滚无敌帧：弹丸穿过无敌目标（不消耗、不结算伤害/击退），可命中其后目标 */
                        if (isDamageImmune(target.combat)) continue
                        if (bullet.explosionRadius > 0) {
                            detonateAt(bullet, bulletPos.x, bulletPos.y, bulletPos.z, allCharacters)
                        } else {
                            /* 冲击方向 = 弹丸 → 目标（水平）：伤害事件携带（死亡倒向依据）并与击退共用 */
                            v3Set(_tmpVec,
                                tp.x - bulletPos.x,
                                0,
                                tp.z - bulletPos.z,
                            )
                            const len = v3Length(_tmpVec)
                            const hasDir = len > 0.0001
                            const dirX = hasDir ? _tmpVec.x / len : 0
                            const dirZ = hasDir ? _tmpVec.z / len : 0

                            applyDamage(target.combat, {
                                sourceId: bullet.ownerId,
                                targetId: target.id,
                                damageType: bullet.damageType,
                                baseAmount: bullet.damage,
                                finalAmount: bullet.damage,
                                skillId: 'ranged',
                                ...(hasDir ? {dirX, dirZ} : {}),
                            })

                            if (bullet.knockbackForce > 0 && hasDir) {
                                target.body.applyImpulseAtPoint(
                                    {
                                        x: dirX * bullet.knockbackForce,
                                        y: 1,
                                        z: dirZ * bullet.knockbackForce,
                                    },
                                    target.body.translation(),
                                    true,
                                )
                            }
                        }
                    }

                    removeBullet(i)
                    hit = true
                    break
                }
            }

            /* 2) 世界受击目标（可破坏道具）：按来源过滤，返回是否消费由目标决定 */
            if (!hit) {
                const worldTargets = getWorldTargets?.()
                if (worldTargets !== undefined) {
                    for (const wt of worldTargets) {
                        if (wt.dead) continue
                        if (Math.abs(bulletPos.x - wt.x) > wt.hx + BULLET_HIT_RADIUS
                            || Math.abs(bulletPos.y - wt.y) > wt.hy + BULLET_HIT_RADIUS
                            || Math.abs(bulletPos.z - wt.z) > wt.hz + BULLET_HIT_RADIUS) continue
                        v3Set(_tmpVec, wt.x - bulletPos.x, 0, wt.z - bulletPos.z)
                        const wlen = v3Length(_tmpVec)
                        const hasDir = wlen > 0.0001
                        const dirX = hasDir ? _tmpVec.x / wlen : 0
                        const dirZ = hasDir ? _tmpVec.z / wlen : 0
                        if (wt.onAttacked('ranged', bullet.damageType, bullet.damage, dirX, dirZ)) {
                            if (bullet.explosionRadius > 0) {
                                detonateAt(bullet, bulletPos.x, bulletPos.y, bulletPos.z, allCharacters)
                            }
                            removeBullet(i)
                            hit = true
                            break
                        }
                    }
                }
            }

            /* 3) 场景几何命中 —— 扫描「上一帧位置 → 当前位置」整段位移，
             * 高速子弹因此不会穿过薄碰撞体；命中可穿过类别之外的场景几何即消失（爆炸子弹就地引爆） */
            if (!hit) {
                const dx = bulletPos.x - bullet.prevX
                const dy = bulletPos.y - bullet.prevY
                const dz = bulletPos.z - bullet.prevZ
                if (dx !== 0 || dy !== 0 || dz !== 0) {
                    v3Set(_sweepOrigin, bullet.prevX, bullet.prevY, bullet.prevZ)
                    v3Set(_sweepVelocity, dx, dy, dz)
                    const sweep = world.castShape(
                        _sweepOrigin, IDENTITY_ROTATION, _sweepVelocity, bulletShape,
                        /* targetDistance 0（接触即命中）、maxToi 1（正好覆盖本帧位移）、初始穿模即判定 */
                        0, 1, true,
                        undefined, undefined, bullet.collider, bullet.body,
                        (collider) => blocksBullet(collider, bullet.passThroughMask),
                    )
                    if (sweep) {
                        /* 爆炸落点取命中点（而非本帧终点），避免爆炸中心埋进碰撞体内部 */
                        const toi = sweep.time_of_impact
                        detonateAt(
                            bullet,
                            bullet.prevX + dx * toi,
                            bullet.prevY + dy * toi,
                            bullet.prevZ + dz * toi,
                            allCharacters,
                        )
                        removeBullet(i)
                        hit = true
                    }
                }
            }

            if (hit) continue

            bullet.prevX = bulletPos.x
            bullet.prevY = bulletPos.y
            bullet.prevZ = bulletPos.z

            const lv = bullet.body.linvel()
            const speed = v3Length(lv)
            if (speed < 1) {
                removeBullet(i)
            }
        }
    }

    const clear = (): void => {
        for (const b of bullets) {
            world.removeRigidBody(b.body)
            b.mesh.removeFromParent()
        }
        bullets.length = 0
    }

    const getBulletCount = (): number => bullets.length

    return {type: 'ranged', start, update, end, updateBullets, getBulletCount, clear}
}
