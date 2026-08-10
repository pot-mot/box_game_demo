import RAPIER from '@dimforge/rapier3d-compat'
import {Mesh, MeshBasicMaterial, SphereGeometry, type Scene} from 'three'
import {v3Set, v3Length, type RapVector3} from '../../../physics/rapier_utils.ts'
import {createColliderForBody} from '../../../physics/rapier_utils.ts'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {SkillExecutor, ExecutorContext} from '../../../character/combat/executor.ts'
import type {SkillConfig} from '../../../character/combat/skill_types.ts'
import type {CombatComponent} from '../../../character/combat/types.ts'
import {applyDamage} from '../../../character/combat/damage.ts'
import {applyExplosionDamage} from '../../../character/combat/explosion.ts'
import {BULLET_SIZE, BULLET_COLLISION_GROUP, BULLET_COLLISION_MASK, BULLET_HIT_RADIUS} from './constants.ts'

const BULLET_GEOMETRY = new SphereGeometry(0.08, 4, 4)
const BULLET_MATERIAL_POOL = new Map<number, MeshBasicMaterial>()

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
}

const _tmpVec: RapVector3 = {x: 0, y: 0, z: 0}

const getPlayerFactionMaterial = (faction: number): MeshBasicMaterial => {
    let mat = BULLET_MATERIAL_POOL.get(faction)
    if (!mat) {
        const hue = (faction * 137) % 360
        mat = new MeshBasicMaterial({color: `hsl(${hue}, 80%, 55%)`})
        BULLET_MATERIAL_POOL.set(faction, mat)
    }
    return mat
}

export const createRangedExecutor = (
    shared: SharedWorld,
    scene: Scene,
): SkillExecutor & { updateBullets: (dt: number, allCharacters: readonly CharacterEntity[]) => void; clear: () => void } => {
    const {world} = shared
    const bullets: BulletInstance[] = []
    const firedThisAttack = new Set<number>()

    const fireBulletInternal = (
        character: CharacterEntity,
        direction: RapVector3,
        speed: number,
        damage: number,
        knockbackForce: number,
        lifetime: number,
        homingStrength: number,
        explosionRadius: number,
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
        bodyDesc.setAdditionalMass(0.01)
        const body = world.createRigidBody(bodyDesc)

        const colliderDesc = RAPIER.ColliderDesc.ball(BULLET_SIZE)
            .setRestitution(0)
            .setCollisionGroups((BULLET_COLLISION_GROUP << 16) | (BULLET_COLLISION_MASK & 0xFFFF))
            .setSensor(true)
        const collider = createColliderForBody(world, colliderDesc, body)

        const hSpeed = speed * Math.cos(throwAngle)
        const vSpeed = speed * Math.sin(throwAngle)
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
            damage,
            knockbackForce,
            lifetime,
            homingStrength,
            explosionRadius,
        })
    }

    const attackDirections = new Map<number, {dx: number; dz: number}>()

    const start = (
        _skill: SkillConfig,
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
        skill: SkillConfig,
        combat: CombatComponent,
        entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        if (skill.type !== 'ranged') return

        if (combat.attackTimer > 0.016 || firedThisAttack.has(entity.id)) return
        firedThisAttack.add(entity.id)

        const dir = attackDirections.get(entity.id)
        const ndx = dir?.dx ?? combat.attackDirX
        const ndz = dir?.dz ?? combat.attackDirZ
        const dirLen = Math.hypot(ndx, ndz)
        const fixedDx = dirLen < 0.001 ? 0 : ndx / dirLen
        const fixedDz = dirLen < 0.001 ? 1 : ndz / dirLen

        const w = skill.weapon
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
                fireBulletInternal(
                    entity, _tmpVec, w.projectileSpeed, w.damage,
                    w.knockbackForce, w.projectileLifetime,
                    w.homingStrength ?? 0, w.explosionRadius ?? 0,
                    throwAngle,
                )
            }
        } else {
            v3Set(_tmpVec, fixedDx, 0, fixedDz)
            fireBulletInternal(
                entity, _tmpVec, w.projectileSpeed, w.damage,
                w.knockbackForce, w.projectileLifetime,
                w.homingStrength ?? 0, w.explosionRadius ?? 0,
                throwAngle,
            )
        }
    }

    const end = (
        _skill: SkillConfig,
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

    const updateBullets = (dt: number, allCharacters: readonly CharacterEntity[]): void => {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i]
            bullet.lifetime -= dt

            const bulletPos = bullet.body.translation()

            if (bullet.lifetime <= 0 || bulletPos.y < -10 || (bullet.explosionRadius > 0 && bulletPos.y < 0)) {
                if (bullet.explosionRadius > 0) {
                    const owner = getOwnerEntity(bullet.ownerId, allCharacters)
                    if (owner) {
                        applyExplosionDamage(
                            bulletPos.x, bulletPos.y, bulletPos.z,
                            bullet.explosionRadius, bullet.damage, bullet.knockbackForce,
                            owner, allCharacters,
                        )
                    }
                }
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

            let hit = false
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

                if (!bullet.ownerAttackTendency(bullet.ownerFaction, target.combat.faction)) continue

                if (bullet.explosionRadius > 0) {
                    const owner = getOwnerEntity(bullet.ownerId, allCharacters)
                    if (owner) {
                        applyExplosionDamage(
                            bulletPos.x, bulletPos.y, bulletPos.z,
                            bullet.explosionRadius, bullet.damage, bullet.knockbackForce,
                            owner, allCharacters,
                        )
                    }
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

                removeBullet(i)
                hit = true
                break
            }

            if (hit) continue

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

    return {type: 'ranged', start, update, end, updateBullets, clear}
}
