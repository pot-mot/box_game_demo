import {Body, Sphere, Vec3, BODY_TYPES} from 'cannon-es'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {SkillExecutor, ExecutorContext} from '../../../character/combat/executor.ts'
import type {SkillConfig} from '../../../character/combat/skill_types.ts'
import type {CombatComponent} from '../../../character/combat/types.ts'
import {applyDamage} from '../../../character/combat/damage.ts'
import {BULLET_SIZE, BULLET_COLLISION_GROUP, BULLET_COLLISION_MASK, BULLET_HIT_RADIUS} from './constants.ts'

interface BulletInstance {
    body: Body
    ownerId: number
    ownerFaction: number
    ownerAttackTendency: import('../../../character/faction.ts').AttackTendency
    damage: number
    knockbackForce: number
    lifetime: number
}

const _tmpVec = new Vec3()

export const createRangedExecutor = (
    shared: SharedWorld,
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
        body.velocity.set(direction.x * speed, direction.y * speed, direction.z * speed)
        world.addBody(body)

        bullets.push({
            body,
            ownerId: character.id,
            ownerFaction: character.combat.faction,
            ownerAttackTendency: character.combat.attackTendency,
            damage,
            knockbackForce,
            lifetime,
        })
    }

    const start = (
        _skill: SkillConfig,
        _combat: CombatComponent,
        entity: CharacterEntity,
        _direction: Vec3,
        _ctx: ExecutorContext,
    ): void => {
        firedThisAttack.delete(entity.id)
    }

    const update = (
        _dt: number,
        skill: SkillConfig,
        combat: CombatComponent,
        entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        if (combat.attackTimer > 0.016 || firedThisAttack.has(entity.id)) return
        firedThisAttack.add(entity.id)

        const dirX = combat.attackDirX
        const dirZ = combat.attackDirZ
        const len = Math.hypot(dirX, dirZ)
        const ndx = len < 0.001 ? 0 : dirX / len
        const ndz = len < 0.001 ? 1 : dirZ / len

        _tmpVec.set(ndx, 0, ndz)
        fireBulletInternal(
            entity, _tmpVec,
            skill.projectileSpeed, skill.damage,
            skill.knockbackForce, skill.projectileLifetime,
        )
    }

    const end = (
        _skill: SkillConfig,
        _combat: CombatComponent,
        _entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        // 子弹继续飞行，不做清理
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
                if (target.id === bullet.ownerId || target.combat.isDead) continue

                _tmpVec.set(
                    bulletPos.x - target.body.position.x,
                    bulletPos.y - target.body.position.y,
                    bulletPos.z - target.body.position.z,
                )
                const dist = _tmpVec.length()
                if (dist > BULLET_HIT_RADIUS) continue

                if (!bullet.ownerAttackTendency(bullet.ownerFaction, target.combat.faction)) continue

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

    return {type: 'ranged', start, update, end, updateBullets, clear}
}
