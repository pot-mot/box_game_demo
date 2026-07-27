import {type Scene, type Mesh} from 'three'
import {Body, BODY_TYPES, Cylinder, Sphere, Vec3} from 'cannon-es'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterConfig, CharacterEntity} from '../../../character/types.ts'
import type {AttackConfig} from '../../../character/archetypes.ts'
import type {TendencyConfig} from '../../../character/faction.ts'
import {resolveTendency} from '../../../character/faction.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'
import type {AIContext} from '../ai/types.ts'
import {createAIMachine, updateAI} from '../ai/machine.ts'
import {createCharacterMesh} from '../render'
import {DEFAULT_CHARACTER_CONFIG, CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK} from '../constants.ts'
import {CHARACTER_LINEAR_DAMPING} from './constants.ts'
import {ATTACK_PRESETS, ATTACK_DEFAULT_MAX_HEALTH, ATTACK_DEFAULT_DETECTION_RANGE} from '../../../character/archetypes.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import {createWeaponManager} from './weapon.ts'
import type {WeaponManager} from './weapon.ts'
import {createBulletPool} from './bullet.ts'
import type {BulletPool} from './bullet.ts'
import type {EntityInfoSource, EntityPanelInfo} from '../../box/base/types/entity_info.ts'
import {createEmitter} from '../../box/base/types/event_emitter.ts'
import {createCharacterPanel} from '../ui/panel.ts'

const _tmpVec = new Vec3()

export interface CharacterEntitySystem extends EntityInfoSource {
    markPlayer: (id: number) => void
    unmarkPlayer: () => void
    setPlayerMove: (dx: number, dz: number, jump: boolean, forwardX: number, forwardZ: number) => void
    setPlayerAttack: () => void
    getPlayerCharacter: () => CharacterEntity | undefined
    getHostileTo: (faction: number) => CharacterEntity[]
    getCharacterByBody: (body: Body) => CharacterEntity | undefined
    update: (dt: number) => void
    setAIEnabled: (enabled: boolean) => void
    activateAI: () => void
    add: (config: CharacterSaveConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, opts?: {health?: number}) => {id: number}
    getAll: () => readonly CharacterEntity[]
    setTransform: (id: number, pos: {x: number; y: number; z: number}) => void
    updateCharacterConfig: (id: number, charCfg: Partial<CharacterConfig>, newAttackSlot?: AttackConfig, newFaction?: number, newMaxHealth?: number) => void
}

const makeBulletConfig = (slot: AttackConfig) => {
    if (slot.type === 'ranged') {
        return {speed: slot.bulletSpeed, size: 0.1, damage: slot.damage, knockbackForce: slot.bulletKnockback, lifetime: slot.bulletLifetime}
    }
    return {speed: 20, size: 0.1, damage: 2, knockbackForce: 3, lifetime: 3}
}

export const setupCharacterEntities = (scene: Scene, shared: SharedWorld): CharacterEntitySystem => {
    const {world} = shared
    const characters: CharacterEntity[] = []
    const aiMap = new Map<number, AIContext>()
    const bodyCharMap = new Map<number, CharacterEntity>()
    const aiTargetDirs = new Map<number, {dx: number; dz: number}>()
    let nextId = 1
    let selectedId: number | undefined
    let aiEnabled = false

    let playerAttackPending = false
    let playerDx = 0
    let playerDz = 0
    let playerJump = false
    let playerForwardX = 0
    let playerForwardZ = 1

    const events = createEmitter<{ delete: [id: number, wasSelected: boolean]; select: [id: number | undefined] }>()
    const panelInfos: EntityPanelInfo[] = []

    const getCharacterByBody = (body: Body): CharacterEntity | undefined => bodyCharMap.get(body.id)

    const weaponManager: WeaponManager = createWeaponManager(shared, getCharacterByBody)
    const bulletPool: BulletPool = createBulletPool(shared)

    const refreshPlayerLabel = (): void => {
        for (const pi of panelInfos) {
            const ch = characters.find(c => c.id === pi.id)
            if (!ch) continue
            const playerPrefix = ch.isPlayer ? '▶ Player: ' : ''
            pi.rowText = `${playerPrefix}#${ch.id}  HP:${ch.health}/${ch.maxHealth}  ${ch.attackSlot.type}  spd:${ch.config.speed}`
        }
    }

    const markPlayer = (id: number): void => {
        for (const c of characters) c.isPlayer = c.id === id
        refreshPlayerLabel()
    }

    const unmarkPlayer = (): void => {
        for (const c of characters) c.isPlayer = false
        refreshPlayerLabel()
    }

    const spawnEntity = (
        config: CharacterConfig,
        attackSlot: AttackConfig,
        tendencyConfig: TendencyConfig,
        faction: number,
        x: number, y: number, z: number,
        isPlayer?: boolean,
    ): CharacterEntity => {
        const mesh = createCharacterMesh(config, attackSlot.type)
        mesh.position.set(x, y, z)
        scene.add(mesh)

        const body = new Body({
            mass: 1,
            type: BODY_TYPES.DYNAMIC,
            linearDamping: CHARACTER_LINEAR_DAMPING,
            fixedRotation: true,
            collisionFilterGroup: CHARACTER_COLLISION_GROUP,
            collisionFilterMask: CHARACTER_COLLISION_MASK,
        })

        const r = config.radius
        const cylH = config.height - r * 2
        body.addShape(new Cylinder(r, r, cylH, 8), new Vec3(0, 0, 0))
        body.addShape(new Sphere(r), new Vec3(0, cylH / 2, 0))
        body.addShape(new Sphere(r), new Vec3(0, -cylH / 2, 0))
        body.position.set(x, y, z)
        world.addBody(body)

        const id = nextId++
        const stateMachine = createCharacterStateMachine()
        const bc = makeBulletConfig(attackSlot)

        const entity: CharacterEntity = {
            id,
            config,
            mesh,
            body,
            isOnGround: true,
            rowText: `Character #${id}`,
            isPlayer: isPlayer ?? false,
            faction,
            attackTendency: resolveTendency(tendencyConfig),
            tendencyConfig,
            attackSlot,
            bulletConfig: bc,
            maxHealth: ATTACK_DEFAULT_MAX_HEALTH[attackSlot.type],
            health: ATTACK_DEFAULT_MAX_HEALTH[attackSlot.type],
            isDead: false,
            stateMachine,
            attackActive: false,
            attackTimer: 0,
            attackCooldownTimer: 0,
            attackedTargets: new Set(),
            attackDirX: 0,
            attackDirZ: 1,
        }

        bodyCharMap.set(body.id, entity)
        characters.push(entity)

        const rowText = isPlayer ? `▶ Player: Character #${id}` : `Character #${id}`
        panelInfos.push({id, type: 'character', badgeLabel: attackSlot.type, badgeColor: attackSlot.type === 'melee' ? '#ff4444' : '#4488ff', rowText})

        return entity
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        const entity = spawnEntity(DEFAULT_CHARACTER_CONFIG, ATTACK_PRESETS.melee, {tendencyId: 'hostileExceptSelf'}, 0, x, y, z)
        select(entity.id)
    }

    const syncPositions = (): void => {
        for (const entity of characters) {
            if (entity.isDead) continue
            entity.mesh.position.set(entity.body.position.x, entity.body.position.y, entity.body.position.z)
            entity.mesh.quaternion.identity()
        }
        refreshPlayerLabel()
    }

    const select = (id: number | undefined): void => {
        selectedId = id
        events.emit('select', id)
    }
    const getSelectedId = (): number | undefined => selectedId

    const remove = (id: number): void => {
        const idx = characters.findIndex(c => c.id === id)
        if (idx === -1) return
        const entity = characters[idx]
        const wasSelected = id === selectedId

        events.emit('delete', id, wasSelected)

        if (entity.attackActive) {
            const wb = weaponManager.ownerMap.get(entity.id)
            if (wb) weaponManager.destroyWeapon(entity, wb)
        }

        scene.remove(entity.mesh)
        world.removeBody(entity.body)
        bodyCharMap.delete(entity.body.id)
        entity.mesh.geometry.dispose()
        const mat = entity.mesh.material
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat.dispose()

        characters.splice(idx, 1)
        aiMap.delete(id)
        aiTargetDirs.delete(id)

        const pi = panelInfos.findIndex(p => p.id === id)
        if (pi !== -1) panelInfos.splice(pi, 1)

        if (id === selectedId) selectedId = undefined
    }

    const getMeshes = (): Mesh[] => characters.map(c => c.mesh)
    const getEntityList = (): Array<{id: number; mesh: Mesh}> => characters.map(c => ({id: c.id, mesh: c.mesh}))
    const getAll = (): readonly CharacterEntity[] => characters

    const setPlayerMove = (dx: number, dz: number, jump: boolean, forwardX: number, forwardZ: number): void => {
        playerDx = dx
        playerDz = dz
        playerJump = jump
        playerForwardX = forwardX
        playerForwardZ = forwardZ
    }

    const setPlayerAttack = (): void => { playerAttackPending = true }

    const getPlayerCharacter = (): CharacterEntity | undefined =>
        characters.find(c => c.isPlayer && !c.isDead)

    const getHostileTo = (faction: number): CharacterEntity[] =>
        characters.filter(c => c.attackTendency(c.faction, faction) && !c.isDead)

    const setAIEnabled = (enabled: boolean): void => { aiEnabled = enabled }

    const checkGround = (entity: CharacterEntity): void => {
        const {body} = entity
        entity.isOnGround = false
        for (const c of world.contacts) {
            if (c.bi === body || c.bj === body) {
                if (c.ni && Math.abs(c.ni.y) > 0.7) {
                    entity.isOnGround = true
                    break
                }
            }
        }
    }

    const update = (dt: number): void => {
        for (const entity of characters) {
            if (entity.isDead) continue

            entity.attackCooldownTimer = Math.max(0, entity.attackCooldownTimer - dt)
            checkGround(entity)

            const aiCtx = aiMap.get(entity.id)
            if (aiCtx && aiEnabled) {
                updateAI(dt, aiCtx, entity, characters, (dx, dz, attack) => {
                    entity.stateMachine.setInput(dx, dz, false, attack)
                    if (attack && (dx !== 0 || dz !== 0)) {
                        aiTargetDirs.set(entity.id, {dx, dz})
                    }
                })
            } else if (entity.isPlayer) {
                entity.stateMachine.setInput(playerDx, playerDz, playerJump, playerAttackPending)
                if (playerAttackPending) {
                    entity.attackDirX = playerForwardX
                    entity.attackDirZ = playerForwardZ
                }
            }

            entity.stateMachine.update(dt, entity)

            if (entity.attackActive && !entity.isDead) {
                if (entity.attackSlot.type === 'melee') {
                    let weaponBody = weaponManager.ownerMap.get(entity.id)
                    if (!weaponBody) weaponBody = weaponManager.createWeapon(entity)
                    weaponManager.updateWeapon(dt, entity, weaponBody)
                } else {
                    if (entity.attackTimer < dt) {
                        const dirInfo = aiTargetDirs.get(entity.id)
                        let dirX = dirInfo ? dirInfo.dx : entity.attackDirX
                        let dirZ = dirInfo ? dirInfo.dz : entity.attackDirZ
                        const len = Math.hypot(dirX, dirZ)
                        if (len < 0.001) { dirX = 0; dirZ = 1 }
                        else { dirX /= len; dirZ /= len }
                        _tmpVec.set(dirX, 0, dirZ)
                        bulletPool.fireBullet(entity, _tmpVec)
                    }
                }
            } else if (!entity.attackActive) {
                const weaponBody = weaponManager.ownerMap.get(entity.id)
                if (weaponBody) weaponManager.destroyWeapon(entity, weaponBody)
            }
        }

        playerAttackPending = false
        playerJump = false

        bulletPool.updateBullets(dt, characters)

        for (let i = characters.length - 1; i >= 0; i--) {
            if (characters[i].isDead) remove(characters[i].id)
        }
    }

    const activateAI = (): void => {
        for (const entity of characters) {
            if (!entity.isPlayer && !aiMap.has(entity.id)) {
                aiMap.set(entity.id, createAIMachine(entity, entity.body.position.x, entity.body.position.y, entity.body.position.z, ATTACK_DEFAULT_DETECTION_RANGE[entity.attackSlot.type]))
            }
        }
    }

    const add = (saveConfig: CharacterSaveConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, opts?: {health?: number}): {id: number} => {
        const cfg: CharacterConfig = {speed: saveConfig.speed, jumpHeight: saveConfig.jumpHeight, radius: saveConfig.radius, height: saveConfig.height}
        const entity = spawnEntity(cfg, saveConfig.attackSlot, saveConfig.tendency, saveConfig.faction, x, y, z, saveConfig.isPlayer)
        entity.maxHealth = saveConfig.maxHealth
        entity.health = opts?.health ?? saveConfig.maxHealth
        if (quat) entity.body.quaternion.set(quat.x, quat.y, quat.z, quat.w)
        if (saveConfig.isPlayer) refreshPlayerLabel()
        return {id: entity.id}
    }

    const setTransform = (id: number, pos: {x: number; y: number; z: number}): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.body.position.set(pos.x, pos.y, pos.z)
        entity.mesh.position.set(pos.x, pos.y, pos.z)
    }

    const updateCharacterConfig = (id: number, charCfg: Partial<CharacterConfig>, newAttackSlot?: AttackConfig, newFaction?: number, newMaxHealth?: number): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        if (charCfg.speed !== undefined) entity.config.speed = charCfg.speed
        if (charCfg.jumpHeight !== undefined) entity.config.jumpHeight = charCfg.jumpHeight
        if (charCfg.radius !== undefined) entity.config.radius = charCfg.radius
        if (charCfg.height !== undefined) entity.config.height = charCfg.height
        if (newAttackSlot) {
            entity.attackSlot = newAttackSlot
            entity.bulletConfig = makeBulletConfig(newAttackSlot)
            const oldMat = entity.mesh.material
            if (Array.isArray(oldMat)) oldMat.forEach(m => m.dispose())
            else oldMat.dispose()
            const newMesh = createCharacterMesh(entity.config, newAttackSlot.type)
            newMesh.position.copy(entity.mesh.position)
            newMesh.quaternion.copy(entity.mesh.quaternion)
            scene.remove(entity.mesh)
            entity.mesh.geometry.dispose()
            entity.mesh = newMesh
            scene.add(newMesh)
            const pi = panelInfos.find(p => p.id === id)
            if (pi) {
                pi.badgeLabel = newAttackSlot.type
                pi.badgeColor = newAttackSlot.type === 'melee' ? '#ff4444' : '#4488ff'
            }
        }
        if (newFaction !== undefined) entity.faction = newFaction
        if (newMaxHealth !== undefined) {
            entity.maxHealth = newMaxHealth
            if (entity.health > newMaxHealth) entity.health = newMaxHealth
        }
    }

    const ctxWithoutPanel: Omit<CharacterEntitySystem, 'panel'> = {
        type: 'character',
        events,
        get panelInfo() { return panelInfos },
        getSelectedId,
        select,
        remove,
        getMeshes,
        getEntityList,
        getAll,
        spawnAt,
        syncPositions,
        markPlayer,
        unmarkPlayer,
        setPlayerMove,
        setPlayerAttack,
        getPlayerCharacter,
        getHostileTo,
        getCharacterByBody,
        update,
        setAIEnabled,
        activateAI,
        add,
        setTransform,
        updateCharacterConfig,
    }

    return {
        ...ctxWithoutPanel,
        panel: createCharacterPanel(ctxWithoutPanel),
    }
}
