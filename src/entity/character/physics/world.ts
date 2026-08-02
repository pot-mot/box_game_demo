import {type Scene, type Mesh} from 'three'
import {Body, BODY_TYPES, Cylinder, Sphere, Vec3} from 'cannon-es'
import type {SharedWorld} from '../../../physics/world.ts'
import type {CharacterConfig, CharacterEntity} from '../../../character/types.ts'
import type {AttackConfig} from '../../../character/archetypes.ts'
import type {TendencyConfig} from '../../../character/faction.ts'
import {resolveTendency} from '../../../character/faction.ts'
import {createCombatComponent} from '../../../character/combat/types.ts'
import type { AttackResult } from '../../../character/combat/types.ts'
import {createSkillSlot, type SkillConfig, type SkillSlot} from '../../../character/combat/skill_types.ts'
import {MELEE_SKILL_PRESETS} from '../../../character/combat/melee_skill.ts'
import {MELEE_WEAPON_PRESETS} from '../../../character/weapon/melee_weapon.ts'
import {RANGED_WEAPON_PRESETS} from '../../../character/weapon/ranged_weapon.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'
import {DYING_DURATION} from '../../../character/state_machine/states/dying.ts'
import type {AIContext} from '../ai/types.ts'
import type {AIStrategy} from '../../../character/ai_strategy.ts'
import {DEFAULT_STRATEGY_CONFIGS} from '../../../character/ai_strategy.ts'
import {createLineOfSightChecker, type LineOfSightChecker} from '../ai/line_of_sight.ts'
import {createAIMachine, updateAI} from '../ai/machine.ts'
import {createCharacterMesh} from '../render'
import {createCharacterModel} from '../appearance/model.ts'
import {createAppearanceSystem} from '../appearance/system.ts'
import type {AppearanceSystem} from '../appearance/system.ts'
import type {CharacterModel} from '../appearance/types.ts'
import {ROTATION_SPEED, VELOCITY_DIR_THRESHOLD} from '../appearance/constants.ts'
import {DEFAULT_CHARACTER_CONFIG, CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK} from '../constants.ts'
import {CHARACTER_LINEAR_DAMPING} from './constants.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import {registerSkillExecutor, getSkillExecutor} from '../../../character/combat/executor.ts'
import {SELECT_PALETTE} from '../appearance/constants.ts'
import {createMeleeExecutor} from '../combat/melee_executor.ts'
import {createRangedExecutor} from '../combat/ranged_executor.ts'
import {createDamageFlash} from '../combat_vfx/damage_flash.ts'
import type {EntityInfoSource, EntityPanelInfo} from '../../box/base/types/entity_info.ts'
import {createEmitter} from '../../box/base/types/event_emitter.ts'
import {createCharacterPanel} from '../ui/panel.ts'

const _tmpVec = new Vec3()

/** 根据阵营取 badge 颜色 */
const factionBadgeColor = (faction: number, isPlayer: boolean): string => {
    if (isPlayer) return '#ffaa00'
    const p = SELECT_PALETTE(faction)
    const r = (p.bodyColor >> 16) & 0xff
    const g = (p.bodyColor >> 8) & 0xff
    const b = p.bodyColor & 0xff
    return `rgb(${r},${g},${b})`
}

export interface CharacterEntitySystem extends EntityInfoSource {
    markPlayer: (id: number) => void
    unmarkPlayer: () => void
    setPlayerMove: (dx: number, dz: number, jump: boolean, forwardX: number, forwardZ: number, sprint?: boolean) => void
    setPlayerAttack: (skillIndex?: number) => import('../../../character/combat/types.ts').AttackResult
    getPlayerCharacter: () => CharacterEntity | undefined
    getHostileTo: (faction: number) => CharacterEntity[]
    getCharacterByBody: (body: Body) => CharacterEntity | undefined
    update: (dt: number) => void
    setAIEnabled: (enabled: boolean) => void
    activateAI: () => void
    add: (config: CharacterSaveConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, opts?: {health?: number}) => {id: number}
    getAll: () => readonly CharacterEntity[]
    setTransform: (id: number, pos: {x: number; y: number; z: number}) => void
    updateCharacterConfig: (id: number, charCfg: Partial<CharacterConfig>, newAttackSlot?: AttackConfig, newFaction?: number, newMaxHealth?: number, newTendencyConfig?: TendencyConfig, newHealth?: number) => void
    /** 设置单个角色的 AI 策略 */
    setAIStrategy: (id: number, strategy: AIStrategy) => void
    /** 设置碰撞体可视化 mesh 的可见性 */
    setCollisionVisible: (visible: boolean) => void
    /** 配置视线检查（需在所有实体系统初始化后调用） */
    setupLineOfSight: (systems: readonly EntityInfoSource[]) => void
}

/** 将旧 AttackConfig 转换为 SkillSlot 数组 */
const attackToSkillSlots = (attack: AttackConfig): SkillSlot[] => {
    if (attack.type === 'melee') {
        const weaponPreset = MELEE_WEAPON_PRESETS[attack.weaponId ?? ''] ?? MELEE_WEAPON_PRESETS.long_sword
        const skill: SkillConfig = {
            id: attack.weaponId ?? 'custom_melee',
            type: 'melee',
            cooldown: attack.cooldown,
            duration: attack.duration,
            weapon: {
                id: weaponPreset.id,
                type: 'melee',
                damage: attack.damage,
                range: attack.range,
                knockbackForce: weaponPreset.knockbackForce,
                knockbackY: weaponPreset.knockbackY,
                arcAngle: weaponPreset.arcAngle,
                arcRadius: weaponPreset.arcRadius,
                arcTilt: weaponPreset.arcTilt,
                detectionRange: weaponPreset.detectionRange,
                mesh: weaponPreset.mesh,
            },
        }
        return [createSkillSlot(skill)]
    }
    const weaponPreset = RANGED_WEAPON_PRESETS[attack.weaponId ?? ''] ?? RANGED_WEAPON_PRESETS.longbow
    const skill: SkillConfig = {
        id: attack.weaponId ?? 'custom_ranged',
        type: 'ranged',
        cooldown: attack.cooldown,
        duration: attack.duration,
        weapon: {
            id: weaponPreset.id,
            type: 'ranged',
            damage: attack.damage,
            range: attack.range,
            knockbackForce: attack.bulletKnockback,
            projectileSpeed: attack.bulletSpeed,
            projectileLifetime: attack.bulletLifetime,
            detectionRange: weaponPreset.detectionRange,
            idealRange: weaponPreset.idealRange,
            retreatRange: weaponPreset.retreatRange,
            spreadCount: weaponPreset.spreadCount,
            spreadAngle: weaponPreset.spreadAngle,
            explosionRadius: weaponPreset.explosionRadius,
            homingStrength: weaponPreset.homingStrength,
            throwAngle: weaponPreset.throwAngle,
            mesh: weaponPreset.mesh,
        },
    }
    return [createSkillSlot(skill)]
}

export const setupCharacterEntities = (scene: Scene, shared: SharedWorld): CharacterEntitySystem => {
    const {world} = shared
    const characters: CharacterEntity[] = []
    const aiMap = new Map<number, AIContext>()
    const bodyCharMap = new Map<number, CharacterEntity>()
    const aiTargetDirs = new Map<number, {dx: number; dz: number}>()
    const appearanceModels = new Map<number, CharacterModel>()
    const appearanceSystems = new Map<number, AppearanceSystem>()
    const facingAngles = new Map<number, number>()
    let nextId = 1
    let selectedId: number | undefined
    let aiEnabled = false

    let playerAttackPending = false
    let playerDx = 0
    let playerDz = 0
    let playerJump = false
    let playerSprint = false
    let playerForwardX = 0
    let playerForwardZ = 1

    const events = createEmitter<{ delete: [id: number, wasSelected: boolean]; select: [id: number | undefined] }>()
    const panelInfos: EntityPanelInfo[] = []

    const getCharacterByBody = (body: Body): CharacterEntity | undefined => bodyCharMap.get(body.id)

    const getAllCharacters = (): readonly CharacterEntity[] => characters
    const getModel = (id: number): CharacterModel | undefined => appearanceModels.get(id)
    const meleeExecutor = createMeleeExecutor(getAllCharacters, getModel)
    const rangedExecutor = createRangedExecutor(shared, scene)
    registerSkillExecutor('melee', meleeExecutor)
    registerSkillExecutor('ranged', rangedExecutor)
    /** 追踪当前激活的近战攻击（用于 start/end 生命周期） */
    const activatedAttacks = new Set<number>()
    /** 受击闪红状态 */
    const flashStates = new Map<number, ReturnType<typeof createDamageFlash>>()
    const noopExecCtx: import('../../../character/combat/executor.ts').ExecutorContext = {
        fireProjectile: () => {},
    }

    let playerAttackSkillIndex = 0

    const refreshPlayerLabel = (): void => {
        for (const pi of panelInfos) {
            const ch = characters.find(c => c.id === pi.id)
            if (!ch) continue
            const playerPrefix = ch.isPlayer ? '▶ Player: ' : ''
            const skill = ch.combat.skills[ch.combat.currentSkillIndex]
            const weaponName = skill?.config.weapon.id ?? '?'
            const weaponDmg = skill?.config.weapon.damage ?? 0
            pi.rowText = `${playerPrefix}#${ch.id}  HP:${ch.combat.health}/${ch.combat.maxHealth}  ${weaponName}(${weaponDmg})  spd:${ch.config.speed}`
            pi.badgeLabel = ch.isPlayer ? 'P' : `F${ch.combat.faction}`
            pi.badgeColor = factionBadgeColor(ch.combat.faction, ch.isPlayer)
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
        aiStrategy: AIStrategy = 'tactical',
    ): CharacterEntity => {
        const mesh = createCharacterMesh(config)
        mesh.position.set(x, y, z)
        scene.add(mesh)

        const model = createCharacterModel(config, faction)
        model.equipWeapon(attackSlot.type === 'melee' ? MELEE_WEAPON_PRESETS.long_sword.mesh : RANGED_WEAPON_PRESETS.longbow.mesh)
        model.group.position.set(x, y, z)
        scene.add(model.group)

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
        const skills = attackToSkillSlots(attackSlot)
        if (isPlayer && attackSlot.type === 'melee') {
            skills.push(createSkillSlot(MELEE_SKILL_PRESETS.heavy_sword_slam))
        }
        const maxHP = attackSlot.type === 'melee' ? 15 : 8

        const combat = createCombatComponent(
            skills, faction,
            resolveTendency(tendencyConfig), tendencyConfig, maxHP,
        )

        const entity: CharacterEntity = {
            id,
            config,
            mesh,
            appearanceGroup: model.group,
            body,
            isOnGround: true,
            rowText: `Character #${id}`,
            isPlayer: isPlayer ?? false,
            aiStrategy,
            isDying: false,
            dyingTimer: 0,
            combat,
            stateMachine,
        }

        bodyCharMap.set(body.id, entity)
        characters.push(entity)
        appearanceModels.set(entity.id, model)
        appearanceSystems.set(entity.id, createAppearanceSystem())

        const flash = createDamageFlash(entity)
        flashStates.set(entity.id, flash)
        entity.combat.onDamageTaken = flash.onDamage

        const rowText = isPlayer ? `▶ Player: Character #${id}` : `Character #${id}`
        const badgeLabel = isPlayer ? 'P' : `F${faction}`
        panelInfos.push({id, type: 'character', badgeLabel, badgeColor: factionBadgeColor(faction, isPlayer ?? false), rowText})

        return entity
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        const meleePreset: AttackConfig = {type: 'melee', range: MELEE_SKILL_PRESETS.long_sword_slash.weapon.range, damage: MELEE_SKILL_PRESETS.long_sword_slash.weapon.damage, cooldown: MELEE_SKILL_PRESETS.long_sword_slash.cooldown, duration: MELEE_SKILL_PRESETS.long_sword_slash.duration}
        const entity = spawnEntity(DEFAULT_CHARACTER_CONFIG, meleePreset, {tendencyId: 'hostileExceptSelf'}, 0, x, y, z)
        select(entity.id)
    }

    const syncPositions = (): void => {
        for (const entity of characters) {
            if (entity.combat.isDead) continue
            entity.mesh.position.set(entity.body.position.x, entity.body.position.y, entity.body.position.z)
            entity.mesh.quaternion.identity()
            entity.appearanceGroup.position.set(entity.body.position.x, entity.body.position.y, entity.body.position.z)
            if (entity.isDying) {
                const mat = entity.mesh.material
                if (Array.isArray(mat)) {
                    for (const m of mat) { m.transparent = true; m.opacity = 1 - entity.dyingTimer / DYING_DURATION }
                } else {
                    mat.transparent = true
                    mat.opacity = 1 - entity.dyingTimer / DYING_DURATION
                }
            }
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

        if (entity.combat.attackActive) {
            const skill = entity.combat.skills[entity.combat.currentSkillIndex]
            if (skill) {
                const executor = getSkillExecutor(skill.config.type)
                executor?.end(skill.config, entity.combat, entity, noopExecCtx)
            }
            activatedAttacks.delete(entity.id)
        }

        scene.remove(entity.mesh)
        world.removeBody(entity.body)
        bodyCharMap.delete(entity.body.id)
        entity.mesh.geometry.dispose()
        const mat = entity.mesh.material
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat.dispose()

        const model = appearanceModels.get(entity.id)
        if (model) {
            scene.remove(model.group)
            model.dispose()
            appearanceModels.delete(entity.id)
        }
        appearanceSystems.delete(entity.id)
        facingAngles.delete(entity.id)

        characters.splice(idx, 1)
        aiMap.delete(id)
        aiTargetDirs.delete(id)
        flashStates.delete(id)

        const pi = panelInfos.findIndex(p => p.id === id)
        if (pi !== -1) panelInfos.splice(pi, 1)

        if (id === selectedId) selectedId = undefined
    }

    const getMeshes = (): Mesh[] => characters.map(c => c.mesh)
    const getEntityList = (): Array<{id: number; mesh: Mesh}> => characters.map(c => ({id: c.id, mesh: c.mesh}))
    const getAll = (): readonly CharacterEntity[] => characters

    const setPlayerMove = (dx: number, dz: number, jump: boolean, forwardX: number, forwardZ: number, sprint?: boolean): void => {
        playerDx = dx
        playerDz = dz
        playerJump = jump
        playerSprint = sprint ?? false
        playerForwardX = forwardX
        playerForwardZ = forwardZ
    }

    const setPlayerAttack = (skillIndex?: number): AttackResult => {
        const player = getPlayerCharacter()
        if (!player || player.combat.isDead) return 'dead'
        if (player.combat.attackActive) return 'already_attacking'
        const idx = skillIndex ?? 0
        if (idx < 0 || idx >= player.combat.skills.length) return 'no_valid_skill'
        const skill = player.combat.skills[idx]
        if (skill.cooldownTimer > 0) return 'cooldown'
        playerAttackPending = true
        playerAttackSkillIndex = idx
        return 'ok'
    }

    const getPlayerCharacter = (): CharacterEntity | undefined =>
        characters.find(c => c.isPlayer && !c.combat.isDead)

    const getHostileTo = (faction: number): CharacterEntity[] =>
        characters.filter(c => c.combat.attackTendency(c.combat.faction, faction) && !c.combat.isDead)

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
            if (entity.combat.isDead) continue

            const activeSkill = entity.combat.skills[entity.combat.currentSkillIndex]
            for (const sk of entity.combat.skills) {
                sk.cooldownTimer = Math.max(0, sk.cooldownTimer - dt)
            }
            flashStates.get(entity.id)?.tick(dt)
            checkGround(entity)

            const aiCtx = aiMap.get(entity.id)
            if (aiCtx && aiEnabled) {
                updateAI(dt, aiCtx, entity, characters, (dx, dz, attack) => {
                    entity.stateMachine.setInput(dx, dz, false, attack, false, 0)
                    if (attack && (dx !== 0 || dz !== 0)) {
                        aiTargetDirs.set(entity.id, {dx, dz})
                        entity.combat.attackDirX = dx
                        entity.combat.attackDirZ = dz
                    }
                })
            } else if (entity.isPlayer) {
                entity.stateMachine.setInput(playerDx, playerDz, playerJump, playerAttackPending, playerSprint, playerAttackSkillIndex)
                if (playerAttackPending) {
                    entity.combat.attackDirX = playerForwardX
                    entity.combat.attackDirZ = playerForwardZ
                }
            }

            entity.stateMachine.update(dt, entity)

            const model = appearanceModels.get(entity.id)
            const sys = appearanceSystems.get(entity.id)
            if (model && sys) {
                const hSpeed = Math.hypot(entity.body.velocity.x, entity.body.velocity.z)
                sys.update(dt, model, entity.stateMachine.currentState, {
                    stateTime: entity.stateMachine.stateTime,
                    horizontalSpeed: hSpeed,
                    swingTilt: entity.combat.swingTilt,
                })

                const vx = entity.body.velocity.x
                const vz = entity.body.velocity.z
                const currentAngle = facingAngles.get(entity.id) ?? 0

                let targetAngle: number
                if (entity.isPlayer) {
                    const inputLen = Math.hypot(playerDx, playerDz)
                    if (inputLen > VELOCITY_DIR_THRESHOLD) {
                        targetAngle = Math.atan2(playerDx, playerDz)
                    } else {
                        targetAngle = currentAngle
                    }
                } else {
                    targetAngle = Math.hypot(vx, vz) > VELOCITY_DIR_THRESHOLD
                        ? Math.atan2(vx, vz)
                        : currentAngle
                }

                let diff = targetAngle - currentAngle
                diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI
                const newAngle = currentAngle + diff * Math.min(ROTATION_SPEED * dt, 1)
                facingAngles.set(entity.id, newAngle)
                model.group.rotation.y = newAngle

                if (entity.isPlayer) {
                    model.headNeck.rotation.y = 0
                } else {
                    model.headNeck.rotation.y = 0
                }
            }

            if (entity.combat.attackActive && !entity.combat.isDead) {
                if (activeSkill) {
                    const executor = getSkillExecutor(activeSkill.config.type)
                    if (executor) {
                        if (!activatedAttacks.has(entity.id)) {
                            activatedAttacks.add(entity.id)
                            const dirInfo = aiTargetDirs.get(entity.id)
                            let dirX = dirInfo ? dirInfo.dx : entity.combat.attackDirX
                            let dirZ = dirInfo ? dirInfo.dz : entity.combat.attackDirZ
                            const len = Math.hypot(dirX, dirZ)
                            if (len < 0.001) { dirX = 0; dirZ = 1 }
                            else { dirX /= len; dirZ /= len }
                            _tmpVec.set(dirX, 0, dirZ)
                            executor.start(activeSkill.config, entity.combat, entity, _tmpVec, noopExecCtx)
                        }
                        executor.update(dt, activeSkill.config, entity.combat, entity, noopExecCtx)
                    }
                }
            } else if (activatedAttacks.has(entity.id)) {
                activatedAttacks.delete(entity.id)
                if (activeSkill) {
                    const executor = getSkillExecutor(activeSkill.config.type)
                    executor?.end(activeSkill.config, entity.combat, entity, noopExecCtx)
                }
            }
        }

        playerAttackPending = false
        playerJump = false

        rangedExecutor.updateBullets(dt, characters)

        for (let i = characters.length - 1; i >= 0; i--) {
            if (characters[i].combat.isDead) remove(characters[i].id)
        }
    }

    let losChecker: LineOfSightChecker | null = null

    const activateAI = (): void => {
        for (const entity of characters) {
            if (!entity.isPlayer && !aiMap.has(entity.id)) {
                aiMap.set(entity.id, createAIMachine(entity, entity.body.position.x, entity.body.position.y, entity.body.position.z, entity.combat.skills[entity.combat.currentSkillIndex]?.config.weapon.detectionRange ?? 8, losChecker, entity.aiStrategy))
            }
        }
    }

    const setupLineOfSight = (systems: readonly EntityInfoSource[]): void => {
        losChecker = createLineOfSightChecker(() => {
            const meshes: Mesh[] = []
            for (const s of systems) {
                for (const m of s.getMeshes()) meshes.push(m)
            }
            return meshes
        })
        for (const ctx of aiMap.values()) {
            ctx.losChecker = losChecker
        }
    }

    const add = (saveConfig: CharacterSaveConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, opts?: {health?: number}): {id: number} => {
        const cfg: CharacterConfig = {speed: saveConfig.speed, jumpHeight: saveConfig.jumpHeight, radius: saveConfig.radius, height: saveConfig.height}
        const entity = spawnEntity(cfg, saveConfig.attackSlot, saveConfig.tendency, saveConfig.faction, x, y, z, saveConfig.isPlayer, saveConfig.aiStrategy ?? 'tactical')
        entity.combat.maxHealth = saveConfig.maxHealth
        entity.combat.health = opts?.health ?? saveConfig.maxHealth
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

    const updateCharacterConfig = (id: number, charCfg: Partial<CharacterConfig>, newAttackSlot?: AttackConfig, newFaction?: number, newMaxHealth?: number, newTendencyConfig?: TendencyConfig, newHealth?: number): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        if (charCfg.speed !== undefined) entity.config.speed = charCfg.speed
        if (charCfg.jumpHeight !== undefined) entity.config.jumpHeight = charCfg.jumpHeight
        if (charCfg.radius !== undefined) entity.config.radius = charCfg.radius
        if (charCfg.height !== undefined) entity.config.height = charCfg.height
        if (newAttackSlot) {
            entity.combat.skills = attackToSkillSlots(newAttackSlot)
            if (entity.isPlayer && newAttackSlot.type === 'melee') {
                entity.combat.skills.push(createSkillSlot(MELEE_SKILL_PRESETS.heavy_sword_slam))
            }
            const model = appearanceModels.get(entity.id)
            if (model) {
                const wId = newAttackSlot.weaponId
                const meshCfg = newAttackSlot.type === 'melee'
                    ? (MELEE_WEAPON_PRESETS[wId ?? ''] ?? MELEE_WEAPON_PRESETS.long_sword).mesh
                    : (RANGED_WEAPON_PRESETS[wId ?? ''] ?? RANGED_WEAPON_PRESETS.longbow).mesh
                model.equipWeapon(meshCfg)
            }
            const pi = panelInfos.find(p => p.id === id)
            if (pi) {
                pi.badgeLabel = entity.isPlayer ? 'P' : `F${entity.combat.faction}`
                pi.badgeColor = factionBadgeColor(entity.combat.faction, entity.isPlayer)
            }
        }
        if (newFaction !== undefined) {
            entity.combat.faction = newFaction
            const model = appearanceModels.get(entity.id)
            if (model) model.recolor(SELECT_PALETTE(newFaction))
        }
        if (newMaxHealth !== undefined) {
            entity.combat.maxHealth = newMaxHealth
            if (entity.combat.health > newMaxHealth) entity.combat.health = newMaxHealth
        }
        if (newHealth !== undefined) {
            entity.combat.health = Math.max(0, Math.min(newHealth, entity.combat.maxHealth))
        }
        if (newTendencyConfig) {
            entity.combat.attackTendency = resolveTendency(newTendencyConfig)
            entity.combat.tendencyConfig = newTendencyConfig
        }
    }

    const setAIStrategy = (id: number, strategy: AIStrategy): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.aiStrategy = strategy
        const ctx = aiMap.get(id)
        if (ctx) {
            ctx.strategy = strategy
            ctx.strategyConfig = DEFAULT_STRATEGY_CONFIGS[strategy]
            ctx.burstAttackCount = 0
        }
    }

    const setCollisionVisible = (visible: boolean): void => {
        for (const entity of characters) {
            entity.mesh.visible = visible
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
        setAIStrategy,
        setCollisionVisible,
        setupLineOfSight,
    }

    return {
        ...ctxWithoutPanel,
        panel: createCharacterPanel(ctxWithoutPanel),
    }
}
