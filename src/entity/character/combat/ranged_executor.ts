import {Body, Sphere, Vec3, BODY_TYPES} from 'cannon-es'
import {Mesh, MeshBasicMaterial, SphereGeometry, type Scene} from 'three'
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
    body: Body
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

const _tmpVec = new Vec3()

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
        direction: Vec3,
        speed: number,
        damage: number,
        knockbackForce: number,
        lifetime: number,
        homingStrength: number,
        explosionRadius: number,
        throwAngle: number,
    ): void => {
        const body = new Body({
            mass: 0.01,
            type: BODY_TYPES.DYNAMIC,
            collisionFilterGroup: BULLET_COLLISION_GROUP,
            collisionFilterMask: BULLET_COLLISION_MASK,
            linearDamping: 0,
            angularDamping: 1,
        })
        body.addShape(new Sphere(BULLET_SIZE))

        const spawnPos = character.body.position
        body.position.set(
            spawnPos.x + direction.x * 0.5,
            spawnPos.y + 0.3,
            spawnPos.z + direction.z * 0.5,
        )

        const hSpeed = speed * Math.cos(throwAngle)
        const vSpeed = speed * Math.sin(throwAngle)
        body.velocity.set(direction.x * hSpeed, vSpeed, direction.z * hSpeed)
        world.addBody(body)

        const material = getPlayerFactionMaterial(character.combat.faction)
        const mesh = new Mesh(BULLET_GEOMETRY, material)
        mesh.position.set(body.position.x, body.position.y, body.position.z)
        scene.add(mesh)

        bullets.push({
            body,
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
        direction: Vec3,
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
                _tmpVec.set(px, 0, pz)
                fireBulletInternal(
                    entity, _tmpVec, w.projectileSpeed, w.damage,
                    w.knockbackForce, w.projectileLifetime,
                    w.homingStrength ?? 0, w.explosionRadius ?? 0,
                    throwAngle,
                )
            }
        } else {
            _tmpVec.set(fixedDx, 0, fixedDz)
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
        world.removeBody(bullet.body)
        bullet.mesh.removeFromParent()
        bullets.splice(idx, 1)
    }

    const getOwnerEntity = (ownerId: number, allCharacters: readonly CharacterEntity[]): CharacterEntity | undefined =>
        allCharacters.find(c => c.id === ownerId)

    const updateBullets = (dt: number, allCharacters: readonly CharacterEntity[]): void => {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i]
            bullet.lifetime -= dt

            const bulletPos = bullet.body.position

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
                const nearestPos = _tmpVec.clone()
                for (const target of allCharacters) {
                    if (target.id === bullet.ownerId || target.combat.isDead) continue
                    if (!bullet.ownerAttackTendency(bullet.ownerFaction, target.combat.faction)) continue
                    const dx = target.body.position.x - bulletPos.x
                    const dy = target.body.position.y - bulletPos.y
                    const dz = target.body.position.z - bulletPos.z
                    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
                    if (d < nearestDist) {
                        nearestDist = d
                        nearestPos.set(dx, dy, dz)
                    }
                }
                if (nearestDist < 15) {
                    const speed = Math.sqrt(
                        bullet.body.velocity.x * bullet.body.velocity.x
                        + bullet.body.velocity.z * bullet.body.velocity.z,
                    )
                    if (nearestDist > 0.0001 && speed > 0.1) {
                        const invLen = 1 / nearestDist
                        const targetDX = nearestPos.x * invLen
                        const targetDZ = nearestPos.z * invLen
                        const currentDX = bullet.body.velocity.x / speed
                        const currentDZ = bullet.body.velocity.z / speed
                        bullet.body.velocity.x += (targetDX - currentDX) * bullet.homingStrength * speed * dt * 4
                        bullet.body.velocity.z += (targetDZ - currentDZ) * bullet.homingStrength * speed * dt * 4
                    }
                }
            }

            bullet.mesh.position.set(bulletPos.x, bulletPos.y, bulletPos.z)

            let hit = false
            for (const target of allCharacters) {
                if (target.id === bullet.ownerId || target.combat.isDead) continue

                _tmpVec.set(
                    bulletPos.x - target.body.position.x,
                    bulletPos.y - target.body.position.y,
                    bulletPos.z - target.body.position.z,
                )
                const dist = _tmpVec.length()
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
                        _tmpVec.set(
                            target.body.position.x - bulletPos.x,
                            0,
                            target.body.position.z - bulletPos.z,
                        )
                        const len = _tmpVec.length()
                        if (len > 0.0001) {
                            _tmpVec.scale(1 / len, _tmpVec)
                            target.body.applyImpulse(
                                new Vec3(_tmpVec.x * bullet.knockbackForce, 1, _tmpVec.z * bullet.knockbackForce),
                                target.body.position,
                            )
                        }
                        target.body.wakeUp()
                    }
                }

                removeBullet(i)
                hit = true
                break
            }

            if (hit) continue

            const speed = Math.sqrt(
                bullet.body.velocity.x * bullet.body.velocity.x
                + bullet.body.velocity.y * bullet.body.velocity.y
                + bullet.body.velocity.z * bullet.body.velocity.z,
            )
            if (speed < 1) {
                removeBullet(i)
            }
        }
    }

    const clear = (): void => {
        for (const b of bullets) {
            world.removeBody(b.body)
            b.mesh.removeFromParent()
        }
        bullets.length = 0
    }

    return {type: 'ranged', start, update, end, updateBullets, clear}
}
