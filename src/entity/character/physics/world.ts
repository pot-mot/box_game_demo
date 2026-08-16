import {type Scene, type Mesh, type LineBasicMaterial, Vector3} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../physics/world.ts'
import {createColliderForBody, setBodyMass} from '../../../physics/rapier_utils.ts'
import {createContactTracker, queryColliderContacts, type ContactTracker} from '../../../physics/contact_tracking.ts'
import type {CharacterConfig, CharacterEntity} from '../../../character/types.ts'
import type {AttackConfig} from '../../../character/archetypes.ts'
import type {TendencyConfig} from '../../../character/faction.ts'
import {resolveTendency} from '../../../character/faction.ts'
import {createCombatComponent} from '../../../character/combat/types.ts'
import type { AttackResult } from '../../../character/combat/types.ts'
import {createSkillSlot, type SkillConfig, type SkillSlot} from '../../../character/combat/skill_types.ts'
import {buildMeleeSkillSlots, MELEE_LIGHT_DURATION, MELEE_LIGHT_CHAIN_COOLDOWN} from '../../../character/combat/melee_skill.ts'
import {MELEE_WEAPON_PRESETS} from '../../../character/weapon/melee_weapon.ts'
import {RANGED_WEAPON_PRESETS} from '../../../character/weapon/ranged_weapon.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'
import {DYING_DURATION} from '../../../character/state_machine/states/dying.ts'
import type {AIContext} from '../ai/types.ts'
import type {PeaceSubStrategy, CombatSubStrategy} from '../../../character/ai_strategy/types.ts'
import type {PeaceConfig} from '../../../character/ai_strategy/peace.ts'
import {DEFAULT_PEACE_CONFIGS} from '../../../character/ai_strategy/peace.ts'
import {DEFAULT_COMBAT_CONFIGS} from '../../../character/ai_strategy/combat.ts'
import type {SpawnBoxCallback} from '../ai/types.ts'
import {createNavSensor, type NavSensor} from '../ai/nav/sensor.ts'
import {createLineOfSightChecker, type LineOfSightChecker} from '../ai/line_of_sight.ts'
import {createAIMachine, updateAI} from '../ai/machine.ts'
import {processNav} from '../ai/nav/machine.ts'
import {createCharacterMesh, updateCharacterMesh} from '../render'
import {createCharacterModel} from '../appearance/model.ts'
import {createAppearanceSystem} from '../appearance/system.ts'
import type {AppearanceSystem} from '../appearance/system.ts'
import {createWeaponTrail, type WeaponTrail} from '../appearance/weapon_trail.ts'
import type {CharacterModel} from '../appearance/types.ts'
import {ROTATION_SPEED, VELOCITY_DIR_THRESHOLD} from '../appearance/constants.ts'
import {DEFAULT_CHARACTER_CONFIG} from '../validation.ts'
import {CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK, CHARACTER_BASE_SIZE} from '../constants.ts'
import {CHARACTER_LINEAR_DAMPING, CHARACTER_SEPARATION_SPEED} from './constants.ts'
import {resolveGroundState} from './ground_state.ts'
import type {GroundContactLike} from './ground_state.ts'
import {computeSeparation, separationSlopeDy} from './separation.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import {registerSkillExecutor, getSkillExecutor} from '../../../character/combat/executor.ts'
import {SELECT_PALETTE} from '../appearance/constants.ts'
import {createMeleeExecutor, testWeaponHitBox} from '../combat/melee_executor.ts'
import {createRangedExecutor} from '../combat/ranged_executor.ts'
import {HITSTOP_DURATION, HITSTOP_TIMESCALE} from '../combat/constants.ts'
import {createDamageFlash} from '../combat_vfx/damage_flash.ts'
import type {WeaponMeshConfig} from '../appearance/weapon_mesh.ts'
import type {EntityInfoSource, EntityPanelInfo} from '../../box/base/types/entity_info.ts'
import {createEmitter} from '../../box/base/types/event_emitter.ts'
import {createWireframe, cleanupWireframe} from '../../box/base/render'
import {createCharacterPanel} from '../ui/panel.ts'
import {resolvePhases} from '../../../character/combat/attack_phases.ts'

/** Rapier 带 body/bodyHandle 反查的超类型 */
type CharacterRigidBody = RAPIER.RigidBody

/** 刀光轨迹刀尖采样复用向量（避免每帧分配） */
const _trailTipVec = new Vector3()

/** 根据 AttackConfig 解析武器模型配置 */
const resolveWeaponMeshConfig = (attack: AttackConfig): WeaponMeshConfig => {
    if (attack.type === 'melee') {
        return (MELEE_WEAPON_PRESETS[attack.weaponId ?? ''] ?? MELEE_WEAPON_PRESETS.long_sword).mesh
    }
    return (RANGED_WEAPON_PRESETS[attack.weaponId ?? ''] ?? RANGED_WEAPON_PRESETS.longbow).mesh
}

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
    getCharacterByBody: (body: CharacterRigidBody) => CharacterEntity | undefined
    update: (dt: number) => void
    setAIEnabled: (enabled: boolean) => void
    activateAI: () => void
    add: (config: CharacterSaveConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, opts?: {health?: number}) => {id: number}
    getAll: () => readonly CharacterEntity[]
    setTransform: (id: number, pos: {x: number; y: number; z: number}) => void
    updateCharacterConfig: (id: number, charCfg: Partial<CharacterConfig>, newAttackSlot?: AttackConfig, newFaction?: number, newMaxHealth?: number, newTendencyConfig?: TendencyConfig, newHealth?: number) => void
    /** 设置单个角色的和平策略 */
    setPeaceStrategy: (id: number, strategy: PeaceSubStrategy) => void
    /** 设置单个角色的和平策略配置 */
    setPeaceConfig: (id: number, config: PeaceConfig) => void
    /** 设置单个角色的战斗策略 */
    setCombatStrategy: (id: number, strategy: CombatSubStrategy) => void
    /** 注册箱子生成回调（供 builder AI 使用） */
    registerBoxSpawner: (fn: SpawnBoxCallback) => void
    /** 设置碰撞体可视化 mesh 的可见性 */
    setCollisionVisible: (visible: boolean) => void
    /** 配置 AI 感知（视线检查 + 导航传感器，需在所有实体系统初始化后调用） */
    setupAI: (systems: readonly EntityInfoSource[]) => void
    /** 设置单角色导航感知开关 */
    setNavEnabled: (id: number, enabled: boolean) => void
    /** 设置近战命中冲击监听器（参数为命中点世界坐标，null 清除） */
    setOnMeleeImpact: (listener: ((x: number, y: number, z: number) => void) | null) => void
}

/** 将旧 AttackConfig 转换为 SkillSlot 数组 */
const attackToSkillSlots = (attack: AttackConfig): SkillSlot[] => {
    if (attack.type === 'melee') {
        /* 近战 = 4 技能槽双链（轻1/重1/轻2/重2）；伤害/侦测范围沿用存档覆写，
         * 段时长/阶段/链结构/链终止冷却取预设（存档 duration 不再决定攻击时长） */
        return buildMeleeSkillSlots(attack.weaponId ?? '', {damage: attack.damage, range: attack.range})
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
    const weaponTrails = new Map<number, WeaponTrail>()
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

    /** 活跃接触对（从碰撞事件总线维护），供地面检测 / AI 推挤 / 分离使用 */
    const contactTracker: ContactTracker = createContactTracker(shared.eventBus)

    const getCharacterByBody = (body: CharacterRigidBody): CharacterEntity | undefined => bodyCharMap.get(body.handle)

    const getAllCharacters = (): readonly CharacterEntity[] => characters
    const getModel = (id: number): CharacterModel | undefined => appearanceModels.get(id)
    /** 命中顿帧计时器（真实时间递减，>0 时角色子系统 dt 缩放趋近冻结） */
    let hitstopTimer = 0
    /** 近战命中冲击监听器（相机震动等打击感系统注入） */
    let meleeImpactListener: ((x: number, y: number, z: number) => void) | null = null

    const setOnMeleeImpact = (listener: ((x: number, y: number, z: number) => void) | null): void => {
        meleeImpactListener = listener
    }

    const meleeExecutor = createMeleeExecutor(getAllCharacters, getModel, (x, y, z) => {
        hitstopTimer = HITSTOP_DURATION
        meleeImpactListener?.(x, y, z)
    })
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
        peaceStrategy: PeaceSubStrategy = 'patrol',
        combatStrategy: CombatSubStrategy = 'tactical',
        navEnabled: boolean = true,
    ): CharacterEntity => {
        const mesh = createCharacterMesh(config)
        mesh.position.set(x, y, z)
        scene.add(mesh)

        const model = createCharacterModel(config, faction)
        model.equipWeapon(resolveWeaponMeshConfig(attackSlot))
        model.group.position.set(x, y, z)
        scene.add(model.group)

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .lockRotations()
            .setLinearDamping(CHARACTER_LINEAR_DAMPING)
            .setTranslation(x, y, z)
        const body = world.createRigidBody(bodyDesc)

        /* 胶囊（竖直）：半径 = 碰撞箱半宽，总高 = 碰撞箱高（2×halfHeight + 2×radius = bh）。
         * 平底 cuboid 跨过 trimesh 网格顶点线时会被内部棱幽灵水平法线卡死（上坡原地卡住），
         * 圆滑底面无挂点；rapier3d-compat 0.19/0.20 的 FIX_INTERNAL_EDGES 已损坏（开启即穿透）不可用 */
        const capsuleRadius = (CHARACTER_BASE_SIZE.width * config.scale) / 2
        const capsuleHalfHeight = (CHARACTER_BASE_SIZE.height * config.scale) / 2 - capsuleRadius
        const colliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, capsuleRadius)
            .setFriction(0)
            /* 密度 0：质量完全由附加质量决定，与碰撞体尺寸（scale）解耦 */
            .setDensity(0)
            .setCollisionGroups((CHARACTER_COLLISION_GROUP << 16) | (CHARACTER_COLLISION_MASK & 0xFFFF))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        const mainCollider = createColliderForBody(world, colliderDesc, body)
        /* 质量恒为 1（对齐 cannon-es master）：击退/磁力/浮力均按 mass=1 计算。
         * 不设置的话 Rapier 按密度 1 × 体积（≈0.04）计算，击退冲量会被放大 25 倍 */
        setBodyMass(body, 1)

        const id = nextId++
        const stateMachine = createCharacterStateMachine()
        const skills = attackToSkillSlots(attackSlot)
        const maxHP = attackSlot.type === 'melee' ? 15 : 8

        const combat = createCombatComponent(
            skills, faction,
            resolveTendency(tendencyConfig), tendencyConfig, maxHP,
        )

        const entity: CharacterEntity = {
            id,
            config,
            mesh,
            wireframe: undefined,
            appearanceGroup: model.group,
            body,
            mainCollider,
            isOnGround: true,
            groundNormal: { x: 0, y: 1, z: 0 },
            groundKeepTimer: 0,
            airborneTime: 0,
            groundedTime: 0,
            rowText: `Character #${id}`,
            isPlayer: isPlayer ?? false,
            navEnabled,
            peaceStrategy,
            combatStrategy,
            isDying: false,
            dyingTimer: 0,
            dashCooldownTimer: 0,
            combat,
            stateMachine,
        }

        bodyCharMap.set(body.handle, entity)
        characters.push(entity)
        appearanceModels.set(entity.id, model)
        appearanceSystems.set(entity.id, createAppearanceSystem())
        weaponTrails.set(entity.id, createWeaponTrail(scene))

        const flash = createDamageFlash(entity)
        flashStates.set(entity.id, flash)
        const originalOnDamage = flash.onDamage
        entity.combat.onDamageTaken = (amount: number) => {
            originalOnDamage(amount)
            /* 攻击中被击中时标记硬直；受击保护窗口内不再触发，防止无限连段锁死（伤害照常） */
            if (entity.combat.attackActive && entity.combat.health > 0 && entity.combat.flinchImmunityTimer <= 0) {
                entity.combat.pendingFlinch = true
            }
        }

        const rowText = isPlayer ? `▶ Player: Character #${id}` : `Character #${id}`
        const badgeLabel = isPlayer ? 'P' : `F${faction}`
        panelInfos.push({id, type: 'character', badgeLabel, badgeColor: factionBadgeColor(faction, isPlayer ?? false), rowText})
        refreshPlayerLabel()

        return entity
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        const wp = MELEE_WEAPON_PRESETS.long_sword
        const meleePreset: AttackConfig = {type: 'melee', range: wp.range, damage: wp.damage, cooldown: MELEE_LIGHT_CHAIN_COOLDOWN, duration: MELEE_LIGHT_DURATION}
        const entity = spawnEntity(DEFAULT_CHARACTER_CONFIG, meleePreset, {tendencyId: 'hostileExceptSelf'}, 0, x, y, z)
        select(entity.id)
    }

    const syncPositions = (): void => {
        for (const entity of characters) {
            if (entity.combat.isDead) continue
            const pos = entity.body.translation()
            entity.mesh.position.set(pos.x, pos.y, pos.z)
            entity.mesh.quaternion.identity()
            entity.appearanceGroup.position.set(pos.x, pos.y, pos.z)
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
        if (selectedId !== undefined) {
            const prev = characters.find(c => c.id === selectedId)
            if (prev) cleanupWireframe(prev)
        }
        selectedId = id
        events.emit('select', id)
        if (id !== undefined) {
            const entity = characters.find(c => c.id === id)
            if (entity) {
                const line = createWireframe(entity.mesh.geometry)
                entity.mesh.add(line)
                entity.wireframe = line
            }
        }
    }
    const getSelectedId = (): number | undefined => selectedId

    const remove = (id: number): void => {
        const idx = characters.findIndex(c => c.id === id)
        if (idx === -1) return
        const entity = characters[idx]
        const wasSelected = id === selectedId

        events.emit('delete', id, wasSelected)

        cleanupWireframe(entity)

        if (entity.combat.attackActive) {
            const skill = entity.combat.skills[entity.combat.currentSkillIndex]
            if (skill) {
                const executor = getSkillExecutor(skill.config.type)
                executor?.end(skill.config, entity.combat, entity, noopExecCtx)
            }
            activatedAttacks.delete(entity.id)
        }

        scene.remove(entity.mesh)
        world.removeRigidBody(entity.body)
        bodyCharMap.delete(entity.body.handle)
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
        weaponTrails.get(entity.id)?.dispose()
        weaponTrails.delete(entity.id)
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
        const idx = skillIndex ?? 0
        if (idx < 0 || idx >= player.combat.skills.length) return 'no_valid_skill'
        if (player.combat.attackActive) {
            /* 攻击中不再拒绝：写入单帧脉冲，由 attacking 缓冲逻辑在段末推进（续链/切链） */
            playerAttackPending = true
            playerAttackSkillIndex = idx
            return 'ok'
        }
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

    const buildGroundContacts = (entity: CharacterEntity): GroundContactLike[] =>
        queryColliderContacts(world, entity.mainCollider, contactTracker.pairsInvolving(entity.mainCollider.handle))

    const checkGround = (entity: CharacterEntity, dt: number): void => {
        const contacts = buildGroundContacts(entity)
        const next = resolveGroundState(contacts, entity.body.handle, {
            isOnGround: entity.isOnGround,
            groundNormal: entity.groundNormal,
            groundKeepTimer: entity.groundKeepTimer,
        }, dt)
        entity.isOnGround = next.isOnGround
        entity.groundNormal = next.groundNormal
        entity.groundKeepTimer = next.groundKeepTimer
    }

    const update = (rawDt: number): void => {
        /* 命中顿帧：角色子系统（状态机/动画/执行器/AI）时间缩放，物理世界不受影响 */
        hitstopTimer = Math.max(0, hitstopTimer - rawDt)
        const dt = hitstopTimer > 0 ? rawDt * HITSTOP_TIMESCALE : rawDt

        /* 清理失效接触对（销毁的实体不会产生 stopped 事件） */
        contactTracker.prune(world)

        for (const entity of characters) {
            if (entity.combat.isDead) continue

            const activeSkill = entity.combat.skills[entity.combat.currentSkillIndex]
            for (const sk of entity.combat.skills) {
                sk.cooldownTimer = Math.max(0, sk.cooldownTimer - dt)
            }
            entity.dashCooldownTimer = Math.max(0, entity.dashCooldownTimer - dt)
            entity.combat.flinchImmunityTimer = Math.max(0, entity.combat.flinchImmunityTimer - dt)
            flashStates.get(entity.id)?.tick(dt)
            checkGround(entity, dt)

            const aiCtx = aiMap.get(entity.id)
            if (aiCtx && aiEnabled) {
                updateAI(dt, aiCtx, entity, characters, (dx, dz, attack, attackDX, attackDZ) => {
                    /* 若与另一个角色有物理接触，禁止继续向其方向推挤 */
                    let finalDX = dx
                    let finalDZ = dz
                    if (dx !== 0 || dz !== 0) {
                        const myHandle = entity.mainCollider.handle
                        for (const pair of contactTracker.pairs.values()) {
                            if (pair.colliderAHandle !== myHandle && pair.colliderBHandle !== myHandle) continue
                            const otherHandle = pair.colliderAHandle === myHandle ? pair.colliderBHandle : pair.colliderAHandle
                            const otherCollider = world.getCollider(otherHandle)
                            if (!otherCollider) continue
                            const otherBody = otherCollider.parent()
                            if (!otherBody) continue
                            if (!bodyCharMap.has(otherBody.handle)) continue
                            const ob = otherBody
                            /* 仅当 AI 输入方向指向接触对方时阻断，允许沿接触面滑开 */
                            const obPos = ob.translation()
                            const myPos = entity.body.translation()
                            const nx = obPos.x - myPos.x
                            const nz = obPos.z - myPos.z
                            if (dx * nx + dz * nz > 0) { finalDX = 0; finalDZ = 0; break }
                        }
                    }

                    /* 导航感知处理（包含 legacy 卡住检测） */
                    let jump = false
                    const sensor = aiCtx.navSensor
                    if (sensor && (finalDX !== 0 || finalDZ !== 0)) {
                        const navResult = processNav(dt, aiCtx.nav, entity, sensor, finalDX, finalDZ)
                        finalDX = navResult.dx
                        finalDZ = navResult.dz
                        jump = navResult.jump
                    }

                    entity.stateMachine.setInput(finalDX, finalDZ, jump, attack, false, 0)
                    aiTargetDirs.set(entity.id, {dx: finalDX, dz: finalDZ})
                    if (attack) {
                        /* 攻击方向：AI 显式指定（如边逃边射面向敌人）优先，缺省取移动方向 */
                        const adx = attackDX ?? dx
                        const adz = attackDZ ?? dz
                        if (adx !== 0 || adz !== 0) {
                            entity.combat.attackDirX = adx
                            entity.combat.attackDirZ = adz
                        }
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
                const linvel = entity.body.linvel()
                const hSpeed = Math.hypot(linvel.x, linvel.z)

                /* 计算阶段动画上下文（仅 attacking 状态注入阶段信息，flinching 等复用动画器时走回退路径） */
                const activeSkill = entity.combat.skills[entity.combat.currentSkillIndex]
                const inAttacking = entity.stateMachine.currentState === 'attacking' && activeSkill !== undefined
                const phases = inAttacking ? resolvePhases(activeSkill.config.phases) : []
                const phaseDuration = entity.combat.phaseIndex < phases.length
                    ? activeSkill!.config.duration * phases[entity.combat.phaseIndex].durationRatio
                    : 1
                const totalDuration = activeSkill?.config.duration ?? 1
                const ctxPhaseName = inAttacking && entity.combat.phaseIndex < phases.length
                    ? phases[entity.combat.phaseIndex].name
                    : undefined

                sys.update(dt, model, entity.stateMachine.currentState, {
                    stateTime: entity.stateMachine.stateTime,
                    horizontalSpeed: hSpeed,
                    horizontalTravel: 0,
                    swingTilt: entity.combat.swingTilt,
                    attackSkillId: inAttacking ? activeSkill!.config.id : undefined,
                    attackPhase: ctxPhaseName,
                    attackPhaseProgress: phaseDuration > 0 ? entity.combat.phaseTimer / phaseDuration : 0,
                    attackTotalProgress: inAttacking && totalDuration > 0 ? entity.combat.attackTimer / totalDuration : 0,
                    attackPhases: inAttacking ? phases : undefined,
                    attackPhaseIndex: entity.combat.phaseIndex,
                    weaponHeld: model.weaponMesh !== null,
                })

                const vx = linvel.x
                const vz = linvel.z
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
                    const aiDir = aiTargetDirs.get(entity.id)
                    if (aiDir !== undefined) {
                        const aiDirLen = Math.hypot(aiDir.dx, aiDir.dz)
                        targetAngle = aiDirLen > VELOCITY_DIR_THRESHOLD
                            ? Math.atan2(aiDir.dx, aiDir.dz)
                            : currentAngle
                    } else {
                        targetAngle = Math.hypot(vx, vz) > VELOCITY_DIR_THRESHOLD
                            ? Math.atan2(vx, vz)
                            : currentAngle
                    }
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

                /* 刀光轨迹：attacking 状态的打击/释放/旋转阶段激活，采样刀尖世界坐标 */
                const trail = weaponTrails.get(entity.id)
                if (trail) {
                    const tip = model.weaponTip
                    if (tip) {
                        tip.getWorldPosition(_trailTipVec)
                        const trailActive = inAttacking
                            && (ctxPhaseName === 'strike' || ctxPhaseName === 'release' || ctxPhaseName === 'spin')
                        trail.update(dt, _trailTipVec, trailActive)
                    } else {
                        trail.update(dt, _trailTipVec, false)
                    }
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
                            const dirVec = { x: dirX, y: 0, z: dirZ }
                            executor.start(activeSkill.config, entity.combat, entity, dirVec, noopExecCtx)
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

        /* 强制水平分离重叠的角色 — 遍历活跃接触对兜底防止卡死 */
        const separated = new Set<string>()
        for (const pair of contactTracker.pairs.values()) {
            const colliderA = world.getCollider(pair.colliderAHandle)
            const colliderB = world.getCollider(pair.colliderBHandle)
            if (!colliderA || !colliderB) continue
            const bodyA = colliderA.parent()
            const bodyB = colliderB.parent()
            if (!bodyA || !bodyB) continue
            const ai = bodyCharMap.get(bodyA.handle)
            const aj = bodyCharMap.get(bodyB.handle)
            if (!ai || !aj) continue
            if (ai.combat.isDead || aj.combat.isDead) continue

            const key = ai.id < aj.id ? `${ai.id}-${aj.id}` : `${aj.id}-${ai.id}`
            if (separated.has(key)) continue
            separated.add(key)

            const aPos = bodyA.translation()
            const bPos = bodyB.translation()
            const maxHalf = Math.max(CHARACTER_BASE_SIZE.width, CHARACTER_BASE_SIZE.depth) / 2
            const sep = computeSeparation({
                aiX: aPos.x, aiZ: aPos.z,
                ajX: bPos.x, ajZ: bPos.z,
                radiusA: maxHalf * ai.config.scale,
                radiusB: maxHalf * aj.config.scale,
            }, CHARACTER_SEPARATION_SPEED)
            if (!sep) continue

            /* 斜坡上水平平移需要沿坡面补偿 Y，否则碰撞体埋进坡面（穿模 + 暴力弹出） */
            const aDy = separationSlopeDy(ai.isOnGround, ai.groundNormal, sep.aiDx, sep.aiDz)
            const bDy = separationSlopeDy(aj.isOnGround, aj.groundNormal, sep.ajDx, sep.ajDz)
            bodyA.setTranslation({ x: aPos.x + sep.aiDx, y: aPos.y + aDy, z: aPos.z + sep.aiDz }, true)
            bodyB.setTranslation({ x: bPos.x + sep.ajDx, y: bPos.y + bDy, z: bPos.z + sep.ajDz }, true)

            const aAfter = bodyA.translation()
            ai.mesh.position.set(aAfter.x, aAfter.y, aAfter.z)
            ai.appearanceGroup.position.set(aAfter.x, aAfter.y, aAfter.z)
            const bAfter = bodyB.translation()
            aj.mesh.position.set(bAfter.x, bAfter.y, bAfter.z)
            aj.appearanceGroup.position.set(bAfter.x, bAfter.y, bAfter.z)

            const aVel = bodyA.linvel()
            const bVel = bodyB.linvel()
            bodyA.setLinvel({ x: aVel.x + sep.aiVx, y: aVel.y, z: aVel.z + sep.aiVz }, true)
            bodyB.setLinvel({ x: bVel.x + sep.ajVx, y: bVel.y, z: bVel.z + sep.ajVz }, true)

            bodyA.wakeUp()
            bodyB.wakeUp()
        }

        playerAttackPending = false
        playerJump = false
        playerSprint = false

        rangedExecutor.updateBullets(dt, characters)

        for (let i = characters.length - 1; i >= 0; i--) {
            if (characters[i].combat.isDead) remove(characters[i].id)
        }
    }

    let losChecker: LineOfSightChecker | null = null
    let navSensor: NavSensor | null = null

    const setNavEnabled = (id: number, enabled: boolean): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.navEnabled = enabled
        const aiCtx = aiMap.get(id)
        if (aiCtx) {
            aiCtx.nav.enabled = enabled
        }
    }

    const activateAI = (): void => {
        for (const entity of characters) {
            if (!entity.isPlayer && !aiMap.has(entity.id)) {
                const pos = entity.body.translation()
                const ctx = createAIMachine(
                    entity,
                    pos.x, pos.y, pos.z,
                    entity.combat.skills[entity.combat.currentSkillIndex]?.config.weapon.detectionRange ?? 8,
                    losChecker,
                    DEFAULT_PEACE_CONFIGS[entity.peaceStrategy],
                    entity.combatStrategy,
                    /* 武器攻击检测区域：武器模型世界位置 AABB（与伤害判定同一几何）；
                     * 未持械/远程时返回 false/距离判定由 AI 侧回退处理 */
                    (character, target) => {
                        const model = appearanceModels.get(character.id)
                        if (!model || !model.weaponMesh) return false
                        const skill = character.combat.skills[character.combat.currentSkillIndex]
                        if (!skill) return false
                        model.weaponMesh.getWorldPosition(_trailTipVec)
                        const tPos = target.body.translation()
                        return testWeaponHitBox(_trailTipVec, skill.config, tPos, target.config.scale)
                    },
                )
                if (boxSpawner) ctx.spawnBox = boxSpawner
                if (navSensor) ctx.navSensor = navSensor
                aiMap.set(entity.id, ctx)
            }
        }
    }

    const setupAI = (systems: readonly EntityInfoSource[]): void => {
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

        /* 同时初始化导航传感器（复用 system 的 mesh 列表） */
        /* 排除 area/ 类型的系统（水域等非障碍物不应参与碰撞检测） */
        navSensor = createNavSensor(
            () => {
                const meshes: Mesh[] = []
                for (const s of systems) {
                    if (s.type.startsWith('area/')) continue
                    for (const m of s.getMeshes()) meshes.push(m)
                }
                return meshes
            },
            () => {
                const terrain = systems.find(s => s.type === 'terrain')
                return terrain?.getMeshes() ?? []
            },
            () => {
                const char = systems.find(s => s.type === 'character')
                return char?.getMeshes() ?? []
            },
        )
        for (const ctx of aiMap.values()) {
            ctx.navSensor = navSensor
        }
    }

    const add = (saveConfig: CharacterSaveConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, opts?: {health?: number}): {id: number} => {
        const cfg: CharacterConfig = {speed: saveConfig.speed, jumpHeight: saveConfig.jumpHeight, scale: saveConfig.scale}
        const entity = spawnEntity(cfg, saveConfig.attackSlot, saveConfig.tendency, saveConfig.faction, x, y, z, saveConfig.isPlayer, saveConfig.peaceStrategy ?? 'patrol', saveConfig.combatStrategy ?? 'tactical', saveConfig.navEnabled ?? true)
        entity.combat.maxHealth = saveConfig.maxHealth
        entity.combat.health = opts?.health ?? saveConfig.maxHealth
        if (quat) entity.body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true)
        /* spawnEntity 之后 maxHealth/health 才被覆盖，需再次刷新列表行 */
        refreshPlayerLabel()
        return {id: entity.id}
    }

    const setTransform = (id: number, pos: {x: number; y: number; z: number}): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true)
        entity.mesh.position.set(pos.x, pos.y, pos.z)
    }

    const updateCharacterConfig = (id: number, charCfg: Partial<CharacterConfig>, newAttackSlot?: AttackConfig, newFaction?: number, newMaxHealth?: number, newTendencyConfig?: TendencyConfig, newHealth?: number): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        if (charCfg.speed !== undefined) entity.config.speed = charCfg.speed
        if (charCfg.jumpHeight !== undefined) entity.config.jumpHeight = charCfg.jumpHeight
        if (charCfg.scale !== undefined) {
            entity.config.scale = charCfg.scale

            const model = appearanceModels.get(entity.id)
            if (model) {
                model.group.scale.set(entity.config.scale, entity.config.scale, entity.config.scale)
            }

            world.removeCollider(entity.mainCollider, true)
            /* 胶囊参数与 spawnEntity 一致（随 scale 缩放） */
            const capsuleRadius = (CHARACTER_BASE_SIZE.width * entity.config.scale) / 2
            const capsuleHalfHeight = (CHARACTER_BASE_SIZE.height * entity.config.scale) / 2 - capsuleRadius
            const colliderDesc = RAPIER.ColliderDesc.capsule(capsuleHalfHeight, capsuleRadius)
                .setFriction(0)
                /* 密度 0：重建碰撞体不改变刚体质量（恒为 1） */
                .setDensity(0)
                .setCollisionGroups((CHARACTER_COLLISION_GROUP << 16) | (CHARACTER_COLLISION_MASK & 0xFFFF))
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
            entity.mainCollider = createColliderForBody(world, colliderDesc, entity.body)
            /* 重建后刷新总质量（碰撞体密度 0，质量仍为 1） */
            setBodyMass(entity.body, 1)
            entity.body.wakeUp()

            updateCharacterMesh(entity.mesh, entity.config.scale)
            if (entity.wireframe) {
                entity.mesh.remove(entity.wireframe)
                entity.wireframe.geometry.dispose()
                ;(entity.wireframe.material as LineBasicMaterial).dispose()
                const newWire = createWireframe(entity.mesh.geometry)
                entity.mesh.add(newWire)
                entity.wireframe = newWire
            }
        }
        if (newAttackSlot) {
            entity.combat.skills = attackToSkillSlots(newAttackSlot)
            entity.combat.currentSkillIndex = 0
            entity.combat.chainEntryIndex = 0
            entity.combat.bufferedSkillIndex = -1
            const model = appearanceModels.get(entity.id)
            if (model) {
                model.equipWeapon(resolveWeaponMeshConfig(newAttackSlot))
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
        refreshPlayerLabel()
    }

    const setPeaceStrategy = (id: number, strategy: PeaceSubStrategy): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.peaceStrategy = strategy
        const ctx = aiMap.get(id)
        if (ctx) {
            ctx.peaceConfig = DEFAULT_PEACE_CONFIGS[strategy]
            /* 切换策略时重置和平 FSM 状态 */
            ctx.peaceState = 'patrol'
            ctx.peaceStateTime = 0
            ctx.waitTimer = 0
        }
    }

    const setPeaceConfig = (id: number, config: PeaceConfig): void => {
        const ctx = aiMap.get(id)
        if (!ctx) return
        ctx.peaceConfig = config
        ctx.peaceState = 'patrol'
        ctx.peaceStateTime = 0
        ctx.waitTimer = 0
    }

    const setCombatStrategy = (id: number, strategy: CombatSubStrategy): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.combatStrategy = strategy
        const ctx = aiMap.get(id)
        if (ctx) {
            ctx.combatStrategy = strategy
            ctx.combatConfig = DEFAULT_COMBAT_CONFIGS[strategy]
            ctx.combatBurstAttackCount = 0
        }
    }

    const setCollisionVisible = (visible: boolean): void => {
        for (const entity of characters) {
            entity.mesh.visible = visible
        }
    }

    const registerBoxSpawner = (fn: SpawnBoxCallback): void => {
        for (const ctx of aiMap.values()) {
            ctx.spawnBox = fn
        }
        /* 记录以便后续新创建的 AI 也能设置 */
        boxSpawner = fn
    }
    let boxSpawner: SpawnBoxCallback | undefined

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
        setPeaceStrategy,
        setPeaceConfig,
        setCombatStrategy,
        registerBoxSpawner,
        setCollisionVisible,
        setupAI,
        setNavEnabled,
        setOnMeleeImpact,
    }

    return {
        ...ctxWithoutPanel,
        panel: createCharacterPanel(ctxWithoutPanel),
    }
}
