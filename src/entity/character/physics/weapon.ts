import {Body, Box, Vec3, BODY_TYPES, Quaternion as CQuat} from 'cannon-es'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterEntity} from '../../../character/types.ts'

export const WEAPON_WIDTH = 0.12
export const WEAPON_HEIGHT = 0.12
export const WEAPON_LENGTH = 1.2
export const WEAPON_COLLISION_GROUP = 16
export const WEAPON_COLLISION_MASK = 1
const WEAPON_KNOCKBACK = 5

const _tmpVec = new Vec3()
const _tmpQuat = new CQuat()

export interface WeaponManager {
    createWeapon: (character: CharacterEntity) => Body
    updateWeapon: (dt: number, character: CharacterEntity, weaponBody: Body) => void
    destroyWeapon: (character: CharacterEntity, weaponBody: Body) => void
    readonly ownerMap: ReadonlyMap<number, Body>
    readonly bodyOwnerMap: ReadonlyMap<number, number>
}

export const createWeaponManager = (
    shared: SharedWorld,
    getCharacterByBody: (body: Body) => CharacterEntity | undefined,
): WeaponManager => {
    const {world} = shared
    const ownerMap = new Map<number, Body>()
    const bodyOwnerMap = new Map<number, number>()
    const listenerMap = new Map<number, (e: { body: Body }) => void>()

    const createWeapon = (character: CharacterEntity): Body => {
        const weaponBody = new Body({
            mass: 0,
            type: BODY_TYPES.KINEMATIC,
            collisionFilterGroup: WEAPON_COLLISION_GROUP,
            collisionFilterMask: WEAPON_COLLISION_MASK,
        })
        weaponBody.addShape(new Box(new Vec3(WEAPON_WIDTH / 2, WEAPON_HEIGHT / 2, WEAPON_LENGTH / 2)))

        const charPos = character.body.position
        weaponBody.position.set(charPos.x, charPos.y + 0.4, charPos.z + 0.4)
        weaponBody.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), -Math.PI / 4)
        world.addBody(weaponBody)

        const onCollide = (e: { body: Body }) => {
            const otherBody = e.body
            if (!otherBody) return
            const target = getCharacterByBody(otherBody)
            if (!target || target.id === character.id) return
            if (!character.body || !target.body) return
            if (character.attackedTargets.has(target.id)) return
            if (!character.attackTendency(character.faction, target.faction)) return

            target.health -= character.attackSlot.type === 'melee' ? character.attackSlot.damage : 0
            if (target.health < 0) target.health = 0
            character.attackedTargets.add(target.id)

            _tmpVec.set(
                target.body.position.x - character.body.position.x,
                0,
                target.body.position.z - character.body.position.z,
            )
            const len = _tmpVec.length()
            if (len > 0.0001) {
                _tmpVec.scale(1 / len, _tmpVec)
                target.body.velocity.x += _tmpVec.x * WEAPON_KNOCKBACK
                target.body.velocity.z += _tmpVec.z * WEAPON_KNOCKBACK
                target.body.velocity.y += 2
            }
            target.body.wakeUp()
        }

        weaponBody.addEventListener('collide', onCollide)
        listenerMap.set(weaponBody.id, onCollide)

        ownerMap.set(character.id, weaponBody)
        bodyOwnerMap.set(weaponBody.id, character.id)
        return weaponBody
    }

    const updateWeapon = (_dt: number, character: CharacterEntity, weaponBody: Body): void => {
        const progress = character.attackTimer / character.attackSlot.duration
        const angle = -Math.PI / 4 + progress * (Math.PI / 2)

        const charPos = character.body.position
        const offsetX = 0
        const offsetY = 0.4
        const offsetZ = 0.4

        const cos = Math.cos(angle)
        const sin = Math.sin(angle)

        weaponBody.position.set(
            charPos.x + offsetX * cos - offsetZ * sin,
            charPos.y + offsetY,
            charPos.z + offsetX * sin + offsetZ * cos,
        )
        _tmpQuat.setFromAxisAngle(_tmpVec.set(0, 1, 0), angle)
        weaponBody.quaternion.copy(_tmpQuat)
    }

    const destroyWeapon = (character: CharacterEntity, weaponBody: Body): void => {
        const handler = listenerMap.get(weaponBody.id)
        if (handler) weaponBody.removeEventListener('collide', handler)
        listenerMap.delete(weaponBody.id)
        world.removeBody(weaponBody)
        ownerMap.delete(character.id)
        bodyOwnerMap.delete(weaponBody.id)
    }

    return {createWeapon, updateWeapon, destroyWeapon, ownerMap, bodyOwnerMap}
}
