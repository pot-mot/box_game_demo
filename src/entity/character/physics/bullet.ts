import {Body, Sphere, Vec3, BODY_TYPES} from 'cannon-es'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {AttackTendency} from '../../../character/faction.ts'

const BULLET_COLLISION_GROUP = 8
const BULLET_COLLISION_MASK = 0
const BULLET_HIT_RADIUS = 0.3
const BULLET_SIZE = 0.1

interface BulletInstance {
    body: Body
    ownerId: number
    ownerFaction: number
    ownerAttackTendency: AttackTendency
    damage: number
    knockbackForce: number
    lifetime: number
}

const _tmpVec = new Vec3()

export interface BulletPool {
    fireBullet: (character: CharacterEntity, direction: Vec3) => void
    updateBullets: (dt: number, allCharacters: readonly CharacterEntity[]) => void
    clear: () => void
}

export const createBulletPool = (shared: SharedWorld): BulletPool => {
    const {world} = shared
    const bullets: BulletInstance[] = []

    const fireBullet = (character: CharacterEntity, direction: Vec3): void => {
        if (character.attackSlot.type !== 'ranged') return

        const cfg = character.bulletConfig
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

        body.velocity.set(direction.x * cfg.speed, direction.y * cfg.speed, direction.z * cfg.speed)
        world.addBody(body)

        bullets.push({
            body,
            ownerId: character.id,
            ownerFaction: character.faction,
            ownerAttackTendency: character.attackTendency,
            damage: cfg.damage,
            knockbackForce: cfg.knockbackForce,
            lifetime: cfg.lifetime,
        })
    }

    const updateBullets = (dt: number, allCharacters: readonly CharacterEntity[]): void => {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i]
            bullet.lifetime -= dt

            const bulletPos = bullet.body.position

            if (bullet.lifetime <= 0 || bulletPos.y < -10) {
                world.removeBody(bullet.body)
                bullets.splice(i, 1)
                continue
            }

            let hit = false
            for (const target of allCharacters) {
                if (target.id === bullet.ownerId || target.isDead) continue

                _tmpVec.set(
                    bulletPos.x - target.body.position.x,
                    bulletPos.y - target.body.position.y,
                    bulletPos.z - target.body.position.z,
                )
                const dist = _tmpVec.length()
                if (dist > BULLET_HIT_RADIUS) continue

                if (!bullet.ownerAttackTendency(bullet.ownerFaction, target.faction)) continue

                target.health -= bullet.damage
                if (target.health < 0) target.health = 0

                if (bullet.knockbackForce > 0) {
                    _tmpVec.set(
                        target.body.position.x - bulletPos.x,
                        0,
                        target.body.position.z - bulletPos.z,
                    )
                    const len = _tmpVec.length()
                    if (len > 0.0001) {
                        _tmpVec.scale(1 / len, _tmpVec)
                        target.body.velocity.x += _tmpVec.x * bullet.knockbackForce
                        target.body.velocity.z += _tmpVec.z * bullet.knockbackForce
                        target.body.velocity.y += 1
                    }
                    target.body.wakeUp()
                }

                world.removeBody(bullet.body)
                bullets.splice(i, 1)
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
                world.removeBody(bullet.body)
                bullets.splice(i, 1)
            }
        }
    }

    const clear = (): void => {
        for (const b of bullets) world.removeBody(b.body)
        bullets.length = 0
    }

    return {fireBullet, updateBullets, clear}
}
