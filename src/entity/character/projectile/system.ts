import RAPIER from '@dimforge/rapier3d-compat'
import {Quaternion, Vector3, type Scene} from 'three'
import {v3Set, v3Length, type RapVector3, type RapQuaternion} from '../../../physics/rapier_utils.ts'
import {createColliderForBody, setBodyMass} from '../../../physics/rapier_utils.ts'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import {applyDamage, isDamageImmune} from '../../../character/combat/damage.ts'
import {applyExplosionDamage} from '../../../character/combat/explosion.ts'
import {
    collisionCategoryMask, isBlockingGeometry, maskIncludesCategory, matchesCategoryMask,
} from '../../../physics/collision_category.ts'
import {DEFAULT_BULLET_PASS_THROUGH_CATEGORIES, DEFAULT_PROJECTILE_GRAVITY_SCALE} from '../../../character/weapon/ranged_weapon.ts'
import {chargeDamageScale} from '../../../character/weapon/charge_tuning.ts'
import {createObjectPool, type ObjectPool} from './pool.ts'
import {createProjectileVisualPool, projectileColorOf} from './mesh.ts'
import {createImpactEffects} from './impact_effect.ts'
import type {Projectile, ProjectileSpawn, ProjectileSystem} from './types.ts'
import {
    EFFECT_IMPACT_SURFACE_OFFSET, PROJECTILE_COLLISION_GROUP, PROJECTILE_COLLISION_MASK,
    PROJECTILE_GROUND_DETONATE_Y, PROJECTILE_HIT_COLOR, PROJECTILE_HIT_RADIUS, PROJECTILE_KILL_Y,
    PROJECTILE_MASS, PROJECTILE_MIN_SPEED, PROJECTILE_POOL_MAX, PROJECTILE_RADIUS,
    PROJECTILE_SPAWN_FORWARD, PROJECTILE_SPAWN_HEIGHT, THROWN_SPIN_SPEED,
} from './constants.ts'

/** 子弹恒不旋转的形状扫描用恒等旋转 */
const IDENTITY_ROTATION: RapQuaternion = {x: 0, y: 0, z: 0, w: 1}

/** 复用入参（避免逐帧分配） */
const _sweepOrigin: RapVector3 = {x: 0, y: 0, z: 0}
const _sweepVelocity: RapVector3 = {x: 0, y: 0, z: 0}
const _tmpVec: RapVector3 = {x: 0, y: 0, z: 0}
const _upVec = new Vector3(0, 1, 0)
const _dirVec = new Vector3()
const _quat = new Quaternion()
const _spinAxis = new Vector3()

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

/**
 * 弹丸系统 —— 物理刚体 / 视觉 / 生命期 / 命中 / 引爆 / 特效的唯一归属。
 * 全部对象（记录 / 视觉 / 刚体 / 特效槽）池化复用；`ranged_executor` 只负责开火时机与方向。
 */
export const createProjectileSystem = (shared: SharedWorld, scene: Scene): ProjectileSystem => {
    const {world} = shared
    const visualPool = createProjectileVisualPool(scene)
    const effects = createImpactEffects(scene)
    const bulletShape = new RAPIER.Ball(PROJECTILE_RADIUS)
    const active: Projectile[] = []

    const createProjectile = (): Projectile => {
        const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0)
        const body = world.createRigidBody(bodyDesc)
        const colliderDesc = RAPIER.ColliderDesc.ball(PROJECTILE_RADIUS)
            .setRestitution(0)
            .setDensity(0)
            .setCollisionGroups((PROJECTILE_COLLISION_GROUP << 16) | (PROJECTILE_COLLISION_MASK & 0xFFFF))
            .setSensor(true)
        const collider = createColliderForBody(world, colliderDesc, body)
        setBodyMass(body, PROJECTILE_MASS)
        body.setEnabled(false)
        return {
            body,
            collider,
            visual: undefined,
            ownerId: 0,
            ownerFaction: 0,
            ownerAttackTendency: () => false,
            damage: 0,
            damageType: 'physical',
            knockbackForce: 0,
            lifetime: 0,
            homingStrength: 0,
            explosionRadius: 0,
            explosionStyle: 'frag',
            explosionColor: PROJECTILE_HIT_COLOR,
            impactColor: PROJECTILE_HIT_COLOR,
            passThroughMask: 0,
            elapsed: 0,
            prevX: 0,
            prevY: 0,
            prevZ: 0,
        }
    }

    const projectilePool: ObjectPool<Projectile> = createObjectPool<Projectile>(
        createProjectile,
        (p) => {
            p.body.setEnabled(false)
        },
        (p) => {
            world.removeRigidBody(p.body)
        },
        PROJECTILE_POOL_MAX,
    )

    const spawn = (args: ProjectileSpawn): void => {
        const {owner, direction, weapon, throwAngle, charge} = args
        const spec = weapon.projectile
        const p = projectilePool.acquire()
        p.body.setEnabled(true)

        /* 蓄力缩放（仅玩家提供 charge 时）：速度控制射程/投掷远近，伤害与生命期同向缩放 */
        const curve = weapon.charge
        const chargeT = charge !== undefined ? Math.max(0, Math.min(1, charge)) : 0
        const scaling = curve !== undefined && charge !== undefined
        const speedScale = scaling ? curve.minSpeedScale + (curve.maxSpeedScale - curve.minSpeedScale) * chargeT : 1
        const damageScale = scaling ? chargeDamageScale(curve, chargeT) : 1
        const lifetimeScale = scaling ? curve.minLifetimeScale + (curve.maxLifetimeScale - curve.minLifetimeScale) * chargeT : 1
        const speed = weapon.projectileSpeed * speedScale

        const spawnPos = owner.body.translation()
        const sx = spawnPos.x + direction.x * PROJECTILE_SPAWN_FORWARD
        const sy = spawnPos.y + PROJECTILE_SPAWN_HEIGHT
        const sz = spawnPos.z + direction.z * PROJECTILE_SPAWN_FORWARD
        p.body.setTranslation({x: sx, y: sy, z: sz}, true)
        p.body.setGravityScale(weapon.projectileGravityScale ?? DEFAULT_PROJECTILE_GRAVITY_SCALE, true)

        const visual = visualPool.acquire(spec, weapon.mesh)
        p.visual = visual

        const hSpeed = speed * Math.cos(throwAngle)
        const vSpeed = speed * Math.sin(throwAngle)
        const vx = direction.x * hSpeed
        const vy = vSpeed
        const vz = direction.z * hSpeed
        p.body.setLinvel({x: vx, y: vy, z: vz}, true)

        /* 朝向初始化：物理朝向（投掷物）沿速度对齐并自旋；其余置恒等，逐帧由速度 / 外观驱动 */
        if (visual.orientation === 'physics') {
            _dirVec.set(vx, vy, vz).normalize()
            _quat.setFromUnitVectors(_upVec, _dirVec)
            p.body.setRotation({x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w}, true)
            if (spec.spin === true) {
                _spinAxis.crossVectors(_dirVec, _upVec)
                if (_spinAxis.lengthSq() < 1e-6) _spinAxis.set(1, 0, 0)
                _spinAxis.normalize().multiplyScalar(THROWN_SPIN_SPEED)
                p.body.setAngvel({x: _spinAxis.x, y: _spinAxis.y, z: _spinAxis.z}, true)
            } else {
                p.body.setAngvel({x: 0, y: 0, z: 0}, true)
            }
        } else {
            p.body.setRotation(IDENTITY_ROTATION, true)
            p.body.setAngvel({x: 0, y: 0, z: 0}, true)
        }

        const isMagic = spec.kind === 'magic_orb'
        const color = projectileColorOf(spec, weapon.mesh)
        p.ownerId = owner.id
        p.ownerFaction = owner.combat.faction
        p.ownerAttackTendency = owner.combat.attackTendency
        p.damage = (weapon.damage + owner.combat.attackBonus[weapon.damageType]) * damageScale
        p.damageType = weapon.damageType
        p.knockbackForce = weapon.knockbackForce
        p.lifetime = weapon.projectileLifetime * lifetimeScale
        p.homingStrength = weapon.homingStrength ?? 0
        p.explosionRadius = weapon.explosionRadius ?? 0
        p.explosionStyle = spec.explosionStyle ?? (weapon.damageType === 'magic' ? 'magic' : 'frag')
        p.explosionColor = isMagic ? color : PROJECTILE_HIT_COLOR
        p.impactColor = isMagic ? color : PROJECTILE_HIT_COLOR
        p.passThroughMask = collisionCategoryMask(
            weapon.passThroughCategories ?? DEFAULT_BULLET_PASS_THROUGH_CATEGORIES,
        )
        p.elapsed = 0
        p.prevX = sx
        p.prevY = sy
        p.prevZ = sz
        visual.group.position.set(sx, sy, sz)

        active.push(p)
    }

    const getOwnerEntity = (ownerId: number, allCharacters: readonly CharacterEntity[]): CharacterEntity | undefined =>
        allCharacters.find(c => c.id === ownerId)

    /** 消失前结算范围伤害（爆炸半径 0 的子弹为空操作）并生成爆炸特效 */
    const detonateAt = (
        p: Projectile,
        x: number,
        y: number,
        z: number,
        allCharacters: readonly CharacterEntity[],
    ): void => {
        if (p.explosionRadius <= 0) return
        effects.explode(x, y, z, p.explosionRadius, p.explosionStyle, p.explosionColor)
        const owner = getOwnerEntity(p.ownerId, allCharacters)
        if (!owner) return
        applyExplosionDamage(
            x, y, z,
            p.explosionRadius, p.damage, p.damageType, p.knockbackForce,
            owner, allCharacters,
        )
    }

    const release = (idx: number): void => {
        const p = active[idx]
        active.splice(idx, 1)
        if (p.visual !== undefined) {
            visualPool.release(p.visual)
            p.visual = undefined
        }
        projectilePool.release(p)
    }

    const syncVisual = (p: Projectile, dt: number, px: number, py: number, pz: number): void => {
        const visual = p.visual
        if (visual === undefined) return
        p.elapsed += dt
        visual.group.position.set(px, py, pz)
        if (visual.orientation === 'velocity') {
            const lv = p.body.linvel()
            const speed = v3Length(lv)
            if (speed > 1e-4) {
                _dirVec.set(lv.x, lv.y, lv.z).multiplyScalar(1 / speed)
                _quat.setFromUnitVectors(_upVec, _dirVec)
                visual.group.quaternion.copy(_quat)
            }
        } else if (visual.orientation === 'physics') {
            const r = p.body.rotation()
            visual.group.quaternion.set(r.x, r.y, r.z, r.w)
        }
        visual.animate?.(p.elapsed)
        visual.trail?.update(dt, px, py, pz)
    }

    const update = (dt: number, allCharacters: readonly CharacterEntity[]): void => {
        effects.update(dt)
        for (let i = active.length - 1; i >= 0; i--) {
            const p = active[i]
            p.lifetime -= dt

            const bulletPos = p.body.translation()

            if (p.lifetime <= 0 || bulletPos.y < PROJECTILE_KILL_Y
                || (p.explosionRadius > 0 && bulletPos.y < PROJECTILE_GROUND_DETONATE_Y)) {
                detonateAt(p, bulletPos.x, bulletPos.y, bulletPos.z, allCharacters)
                release(i)
                continue
            }

            if (p.homingStrength > 0) {
                let nearestDist = Infinity
                let nearestDx = 0
                let nearestDz = 0
                for (const target of allCharacters) {
                    if (target.id === p.ownerId || target.combat.isDead) continue
                    if (!p.ownerAttackTendency(p.ownerFaction, target.combat.faction)) continue
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
                    const lv = p.body.linvel()
                    const speed = Math.sqrt(lv.x * lv.x + lv.z * lv.z)
                    if (nearestDist > 0.0001 && speed > 0.1) {
                        const invLen = 1 / nearestDist
                        const targetDX = nearestDx * invLen
                        const targetDZ = nearestDz * invLen
                        const currentDX = lv.x / speed
                        const currentDZ = lv.z / speed
                        p.body.setLinvel(
                            {
                                x: lv.x + (targetDX - currentDX) * p.homingStrength * speed * dt * 4,
                                y: lv.y,
                                z: lv.z + (targetDZ - currentDZ) * p.homingStrength * speed * dt * 4,
                            },
                            true,
                        )
                    }
                }
            }

            syncVisual(p, dt, bulletPos.x, bulletPos.y, bulletPos.z)

            /* 1) 角色命中 —— 宽容半径判定（角色类别不参与形状扫描）。
             * 命中角色即消失；仅敌对阵营结算伤害 / 击退 / 爆炸；
             * 翻滚无敌目标视为穿过（不消耗、不结算，可命中其后目标） */
            let hit = false
            if (!maskIncludesCategory(p.passThroughMask, 'character')) {
                for (const target of allCharacters) {
                    if (target.id === p.ownerId || target.combat.isDead) continue

                    const tp = target.body.translation()
                    v3Set(_tmpVec,
                        bulletPos.x - tp.x,
                        bulletPos.y - tp.y,
                        bulletPos.z - tp.z,
                    )
                    const dist = v3Length(_tmpVec)
                    if (dist > PROJECTILE_HIT_RADIUS) continue

                    if (p.ownerAttackTendency(p.ownerFaction, target.combat.faction)) {
                        if (isDamageImmune(target.combat)) continue
                        if (p.explosionRadius > 0) {
                            detonateAt(p, bulletPos.x, bulletPos.y, bulletPos.z, allCharacters)
                        } else {
                            /* 命中闪光贴到目标表面（沿「目标 → 弹丸」方向偏移），
                             * 避免高速弹在距目标最远 1 个宽容半径处生成悬空闪光 */
                            const surfaceOffset = dist > 1e-4
                                ? Math.min(dist, EFFECT_IMPACT_SURFACE_OFFSET) / dist
                                : 0
                            effects.hit(
                                tp.x + _tmpVec.x * surfaceOffset,
                                tp.y + _tmpVec.y * surfaceOffset,
                                tp.z + _tmpVec.z * surfaceOffset,
                                p.impactColor,
                            )
                            /* 冲击方向 = 弹丸 → 目标（水平）：伤害事件携带并与击退共用 */
                            v3Set(_tmpVec, tp.x - bulletPos.x, 0, tp.z - bulletPos.z)
                            const len = v3Length(_tmpVec)
                            const hasDir = len > 0.0001
                            const dirX = hasDir ? _tmpVec.x / len : 0
                            const dirZ = hasDir ? _tmpVec.z / len : 0

                            applyDamage(target.combat, {
                                sourceId: p.ownerId,
                                targetId: target.id,
                                damageType: p.damageType,
                                baseAmount: p.damage,
                                finalAmount: p.damage,
                                skillId: 'ranged',
                                ...(hasDir ? {dirX, dirZ} : {}),
                            })

                            if (p.knockbackForce > 0 && hasDir) {
                                target.body.applyImpulseAtPoint(
                                    {
                                        x: dirX * p.knockbackForce,
                                        y: 1,
                                        z: dirZ * p.knockbackForce,
                                    },
                                    target.body.translation(),
                                    true,
                                )
                            }
                        }
                    }

                    release(i)
                    hit = true
                    break
                }
            }

            /* 2) 场景几何命中 —— 扫描「上一帧位置 → 当前位置」整段位移，
             * 高速子弹不会穿过薄碰撞体；命中可穿过类别之外的场景几何即消失（爆炸子弹就地引爆） */
            if (!hit) {
                const dx = bulletPos.x - p.prevX
                const dy = bulletPos.y - p.prevY
                const dz = bulletPos.z - p.prevZ
                if (dx !== 0 || dy !== 0 || dz !== 0) {
                    v3Set(_sweepOrigin, p.prevX, p.prevY, p.prevZ)
                    v3Set(_sweepVelocity, dx, dy, dz)
                    const sweep = world.castShape(
                        _sweepOrigin, IDENTITY_ROTATION, _sweepVelocity, bulletShape,
                        0, 1, true,
                        undefined, undefined, p.collider, p.body,
                        (collider) => blocksBullet(collider, p.passThroughMask),
                    )
                    if (sweep) {
                        const toi = sweep.time_of_impact
                        const hx = p.prevX + dx * toi
                        const hy = p.prevY + dy * toi
                        const hz = p.prevZ + dz * toi
                        if (p.explosionRadius > 0) {
                            detonateAt(p, hx, hy, hz, allCharacters)
                        } else {
                            effects.hit(hx, hy, hz, p.impactColor)
                        }
                        release(i)
                        hit = true
                    }
                }
            }

            if (hit) continue

            p.prevX = bulletPos.x
            p.prevY = bulletPos.y
            p.prevZ = bulletPos.z

            const lv = p.body.linvel()
            if (v3Length(lv) < PROJECTILE_MIN_SPEED) {
                release(i)
            }
        }
    }

    const clear = (): void => {
        for (const p of active) {
            if (p.visual !== undefined) {
                visualPool.release(p.visual)
                p.visual = undefined
            }
            projectilePool.release(p)
        }
        active.length = 0
        effects.clear()
    }

    return {
        spawn,
        update,
        clear,
        count: () => active.length,
        effectCount: () => effects.activeCount(),
    }
}
