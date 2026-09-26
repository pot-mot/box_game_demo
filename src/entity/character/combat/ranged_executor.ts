import RAPIER from '@dimforge/rapier3d-compat'
import {Mesh, MeshBasicMaterial, SphereGeometry, type Scene} from 'three'
import {v3Set, v3Length, type RapVector3, type RapQuaternion} from '../../../physics/rapier_utils.ts'
import {createColliderForBody, setBodyMass} from '../../../physics/rapier_utils.ts'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {SkillExecutor, ExecutorContext} from '../../../character/combat/executor.ts'
import type {CombatComponent} from '../../../character/combat/types.ts'
import {applyDamage} from '../../../character/combat/damage.ts'
import {applyExplosionDamage} from '../../../character/combat/explosion.ts'
import {resolvePhases} from '../../../character/combat/attack_phases.ts'
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
            damage: weapon.damage,
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

        const dir = attackDirections.get(entity.id)
        const ndx = dir?.dx ?? combat.attackDirX
        const ndz = dir?.dz ?? combat.attackDirZ
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
            bullet.explosionRadius, bullet.damage, bullet.knockbackForce,
            owner, allCharacters,
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
             * 命中角色即消失（角色不在可穿过类别内时）；仅敌对阵营结算伤害 / 击退 / 爆炸 */
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
                        if (bullet.explosionRadius > 0) {
                            detonateAt(bullet, bulletPos.x, bulletPos.y, bulletPos.z, allCharacters)
                        } else {
                            applyDamage(target.combat, {
                                sourceId: bullet.ownerId,
                                targetId: target.id,
                                baseAmount: bullet.damage,
                                finalAmount: bullet.damage,
                                skillId: 'ranged',
                            })

                            if (bullet.knockbackForce > 0) {
                                v3Set(_tmpVec,
                                    tp.x - bulletPos.x,
                                    0,
                                    tp.z - bulletPos.z,
                                )
                                const len = v3Length(_tmpVec)
                                if (len > 0.0001) {
                                    _tmpVec.x /= len
                                    _tmpVec.z /= len
                                    target.body.applyImpulseAtPoint(
                                        {
                                            x: _tmpVec.x * bullet.knockbackForce,
                                            y: 1,
                                            z: _tmpVec.z * bullet.knockbackForce,
                                        },
                                        target.body.translation(),
                                        true,
                                    )
                                }
                            }
                        }
                    }

                    removeBullet(i)
                    hit = true
                    break
                }
            }

            /* 2) 场景几何命中 —— 扫描「上一帧位置 → 当前位置」整段位移，
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
