import {Body, Box, Vec3, BODY_TYPES, Quaternion as CQuat} from 'cannon-es'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import type {SkillExecutor, ExecutorContext} from '../../../character/combat/executor.ts'
import type {SkillConfig, SkillSlot} from '../../../character/combat/skill_types.ts'
import {applyDamage} from '../../../character/combat/damage.ts'
import type {CombatComponent} from '../../../character/combat/types.ts'
import {WEAPON_WIDTH, WEAPON_HEIGHT, WEAPON_LENGTH, WEAPON_COLLISION_GROUP, WEAPON_COLLISION_MASK} from './constants.ts'

const _tmpVec = new Vec3()
const _tmpQuat = new CQuat()

interface WeaponInstance {
    body: Body
    listener: (e: { body: Body }) => void
}

export const createMeleeExecutor = (
    shared: SharedWorld,
    getCharacterByBody: (body: Body) => CharacterEntity | undefined,
): SkillExecutor => {
    const {world} = shared
    /** owner entity id → weapon instance */
    const weaponMap = new Map<number, WeaponInstance>()

    const destroyWeaponInternal = (ownerId: number): void => {
        const wi = weaponMap.get(ownerId)
        if (!wi) return
        wi.body.removeEventListener('collide', wi.listener)
        world.removeBody(wi.body)
        weaponMap.delete(ownerId)
    }

    const start = (
        skill: SkillConfig,
        combat: CombatComponent,
        entity: CharacterEntity,
        _direction: Vec3,
        _ctx: ExecutorContext,
    ): void => {
        const weaponBody = new Body({
            mass: 0,
            type: BODY_TYPES.KINEMATIC,
            collisionFilterGroup: WEAPON_COLLISION_GROUP,
            collisionFilterMask: WEAPON_COLLISION_MASK,
        })
        weaponBody.addShape(new Box(new Vec3(WEAPON_WIDTH / 2, WEAPON_HEIGHT / 2, WEAPON_LENGTH / 2)))

        const charPos = entity.body.position
        weaponBody.position.set(charPos.x, charPos.y + 0.4, charPos.z + 0.4)
        weaponBody.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), -Math.PI / 4)
        world.addBody(weaponBody)

        const onCollide = (e: { body: Body }) => {
            const otherBody = e.body
            if (!otherBody) return
            const target = getCharacterByBody(otherBody)
            if (!target || target.id === entity.id) return
            if (!entity.body || !target.body) return
            const tc = target.combat
            if (combat.attackedTargets.has(target.id)) return
            if (!combat.attackTendency(combat.faction, tc.faction)) return

            applyDamage(tc, {
                sourceId: entity.id,
                targetId: target.id,
                baseAmount: skill.damage,
                finalAmount: skill.damage,
                skillId: skill.id,
            })
            combat.attackedTargets.add(target.id)

            _tmpVec.set(
                target.body.position.x - entity.body.position.x,
                0,
                target.body.position.z - entity.body.position.z,
            )
            const len = _tmpVec.length()
            if (len > 0.0001) {
                _tmpVec.scale(1 / len, _tmpVec)
                target.body.applyImpulse(
                    new Vec3(_tmpVec.x * skill.knockbackForce, skill.knockbackY, _tmpVec.z * skill.knockbackForce),
                    target.body.position,
                )
            }
            target.body.wakeUp()
        }

        weaponBody.addEventListener('collide', onCollide)
        weaponMap.set(entity.id, {body: weaponBody, listener: onCollide})
    }

    const update = (
        _dt: number,
        _skill: SkillConfig,
        combat: CombatComponent,
        entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        const wi = weaponMap.get(entity.id)
        if (!wi) return

        const skillSlot = combat.skills[combat.currentSkillIndex] as SkillSlot | undefined
        const duration = skillSlot?.config.duration ?? 1
        const progress = Math.min(combat.attackTimer / duration, 1)
        const angle = -Math.PI / 4 + progress * (Math.PI / 2)

        const charPos = entity.body.position
        const offsetX = 0
        const offsetY = 0.4
        const offsetZ = 0.4

        const cos = Math.cos(angle)
        const sin = Math.sin(angle)

        wi.body.position.set(
            charPos.x + offsetX * cos - offsetZ * sin,
            charPos.y + offsetY,
            charPos.z + offsetX * sin + offsetZ * cos,
        )
        _tmpQuat.setFromAxisAngle(_tmpVec.set(0, 1, 0), angle)
        wi.body.quaternion.copy(_tmpQuat)
    }

    const end = (
        _skill: SkillConfig,
        _combat: CombatComponent,
        entity: CharacterEntity,
        _ctx: ExecutorContext,
    ): void => {
        destroyWeaponInternal(entity.id)
    }

    return {type: 'melee', start, update, end}
}
