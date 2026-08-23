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
import {buildMeleeSkillSlots, MELEE_LIGHT_DURATION} from '../../../character/combat/melee_skill.ts'
import {resolveEntrySkillIndex} from '../../../character/combat/combo_guard.ts'
import {TEST_WEAPON_ID, TEST_WEAPON, buildTestWeaponSkillSlots} from '../../../character/combat/test_weapon.ts'
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
import {createAIMachine, updateAI, notifyAIDamaged} from '../ai/machine.ts'
import {processNav} from '../ai/nav/machine.ts'
import {createCharacterMesh, updateCharacterMesh} from '../render'
import {COLLIDER_MESH_OPACITY} from '../render/constants.ts'
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
import {createMeleeExecutor, testAttackDetect, attackDetectOBB, targetHitBoxHalves} from '../combat/melee_executor.ts'
import {createRangedExecutor} from '../combat/ranged_executor.ts'
import {HITSTOP_DURATION, HITSTOP_TIMESCALE} from '../combat/constants.ts'
import {createDamageFlash} from '../combat_vfx/damage_flash.ts'
import {createAttackHitBoxes, syncWeaponDebugBox, type AttackHitBoxes} from '../combat_vfx/hitbox_debug.ts'
import {VISION_FAN_HALF_ANGLE, VISION_FAN_RAY_COUNT, VISION_FAN_RAY_STEP} from '../ai/constants.ts'
import type {WeaponMeshConfig} from '../appearance/weapon_mesh.ts'
import type {EntityInfoSource, EntityPanelInfo} from '../../box/base/types/entity_info.ts'
import {createEmitter} from '../../box/base/types/event_emitter.ts'
import {createWireframe, cleanupWireframe} from '../../box/base/render'
import {createCharacterPanel} from '../ui/panel.ts'
import {resolvePhases, phaseDurationOf} from '../../../character/combat/attack_phases.ts'

/** Rapier 带 body/bodyHandle 反查的超类型 */
type CharacterRigidBody = RAPIER.RigidBody

/** 刀光轨迹刀尖采样复用向量（避免每帧分配） */
const _trailTipVec = new Vector3()

/** 根据 AttackConfig 解析武器模型配置 */
const resolveWeaponMeshConfig = (attack: AttackConfig): WeaponMeshConfig => {
    if (attack.type === 'melee') {
        if (attack.weaponId === TEST_WEAPON_ID) return TEST_WEAPON.mesh
        return (MELEE_WEAPON_PRESETS[attack.weaponId ?? ''] ?? MELEE_WEAPON_PRESETS.long_sword).mesh
    }
    return (RANGED_WEAPON_PRESETS[attack.weaponId ?? ''] ?? RANGED_WEAPON_PRESETS.longbow).mesh
}

/* 视线扇形可视化 castFan 命中距离复用缓冲 */
const _fanVizDists = new Float32Array(VISION_FAN_RAY_COUNT)

/** 写入视线扇形调试线段顶点：扇形扫描射线（每 10° 一条，截断到遮挡点）+ 可选目标连线（无目标时退化为点） */
const placeVisionFan = (
    hitBoxes: AttackHitBoxes,
    los: LineOfSightChecker | null,
    x: number, eyeY: number, z: number,
    yaw: number, len: number,
    targetX?: number, targetY?: number, targetZ?: number,
): void => {
    const vp = hitBoxes.visionPositions
    /* 与索敌判定同源：castFan 扫描整个扇形，射线截断到最近遮挡点（无 checker 时直达侦测半径） */
    if (los) los.castFan(x, eyeY, z, yaw, len, _fanVizDists)
    let p = 0
    for (let i = 0; i < VISION_FAN_RAY_COUNT; i++) {
        const a = yaw - VISION_FAN_HALF_ANGLE + i * VISION_FAN_RAY_STEP
        const r = los ? Math.min(_fanVizDists[i], len) : len
        vp[p++] = x; vp[p++] = eyeY; vp[p++] = z
        vp[p++] = x + Math.sin(a) * r; vp[p++] = eyeY; vp[p++] = z + Math.cos(a) * r
    }
    /* 末段：当前目标连线（无目标时收缩为不可见点） */
    vp[p++] = x; vp[p++] = eyeY; vp[p++] = z
    if (targetX !== undefined && targetY !== undefined && targetZ !== undefined) {
        vp[p++] = targetX; vp[p++] = targetY; vp[p++] = targetZ
    } else {
        vp[p++] = x; vp[p++] = eyeY; vp[p++] = z
    }
    hitBoxes.markVisionDirty()
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
    setPlayerAttack: (skillIndex?: number, holdDuration?: number) => import('../../../character/combat/types.ts').AttackResult
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
    /** 设置碰撞体可视化 mesh 与攻击判定箱调试线框的可见性 */
    setCollisionVisible: (visible: boolean) => void
    /** 获取角色朝向角（度，0-360，0 = 世界 +Z 前方） */
    getFacing: (id: number) => number
    /** 设置角色朝向角（度，自动归一到 0-360，编辑暂停态亦即时生效） */
    setFacing: (id: number, degrees: number) => void
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
        /* test_weapon：测试专用武器，走自定义 6 槽守卫链装配（不进生产预设表） */
        if ((attack.weaponId ?? '') === TEST_WEAPON_ID) return buildTestWeaponSkillSlots()
        /* 近战 = 4 技能槽双链（轻1/重1/轻2/重2）；伤害沿用存档覆写，
         * 段时长/阶段/链结构/起手冷却取预设（存档 duration 不再决定攻击时长） */
        return buildMeleeSkillSlots(attack.weaponId ?? '', {damage: attack.damage})
    }
    const weaponPreset = RANGED_WEAPON_PRESETS[attack.weaponId ?? ''] ?? RANGED_WEAPON_PRESETS.longbow
    const skill: SkillConfig = {
        id: attack.weaponId ?? 'custom_ranged',
        type: 'ranged',
        /* 远程普通攻击默认无冷却；存档/面板仍可配置非 0 值（触发时开始计时，只挡起手） */
        cooldown: attack.cooldown,
        duration: attack.duration,
        recovery: 0,
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
    /** 攻击判定箱调试线框（edit 模式随碰撞体可视化一同显示） */
    const attackHitBoxes = new Map<number, AttackHitBoxes>()
    let attackHitBoxVisible = false
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

    const meleeExecutor = createMeleeExecutor(getAllCharacters, getModel, (id) => facingAngles.get(id) ?? 0, (x, y, z) => {
        hitstopTimer = HITSTOP_DURATION
        meleeImpactListener?.(x, y, z)
    })
    const rangedExecutor = createRangedExecutor(shared, scene)
    registerSkillExecutor('melee', meleeExecutor)
    registerSkillExecutor('ranged', rangedExecutor)
    /* 攻击动画事件轨道 → 近战命中窗口（hitbox_on/off，与视觉动画同步） */
    const onAttackEvent = (record: {eventName: string}): void => {
        if (record.eventName === 'hitbox_on') meleeExecutor.setHitWindow(true)
        if (record.eventName === 'hitbox_off') meleeExecutor.setHitWindow(false)
    }
    /** 追踪当前激活的近战攻击（用于 start/end 生命周期） */
    const activatedAttacks = new Set<number>()
    /** 受击闪红状态 */
    const flashStates = new Map<number, ReturnType<typeof createDamageFlash>>()
    const noopExecCtx: import('../../../character/combat/executor.ts').ExecutorContext = {
        fireProjectile: () => {},
    }

    let playerAttackSkillIndex = 0
    /** 玩家攻击脉冲携带的按键按住时长（秒），帧末与脉冲一同归零 */
    let playerAttackHoldDuration = 0

    /** 列表行当前状态文本：角色 FSM 状态；AI 激活时追加 AI 双层 FSM（和平/战斗层:子状态）；死亡显示 dead */
    const stateLabelOf = (ch: CharacterEntity): string => {
        if (ch.combat.isDead) return 'dead'
        const ai = aiMap.get(ch.id)
        if (ai === undefined) return ch.stateMachine.currentState
        return ai.activeFsm === 'combat'
            ? `${ch.stateMachine.currentState}|combat:${ai.combatState}`
            : `${ch.stateMachine.currentState}|peace:${ai.peaceState}`
    }

    const refreshPlayerLabel = (): void => {
        const infoById = new Map(panelInfos.map(pi => [pi.id, pi]))
        for (const ch of characters) {
            const pi = infoById.get(ch.id)
            if (!pi) continue
            const playerPrefix = ch.isPlayer ? '▶ Player: ' : ''
            const skill = ch.combat.skills[ch.combat.currentSkillIndex]
            const weaponName = skill?.config.weapon.id ?? '?'
            const weaponDmg = skill?.config.weapon.damage ?? 0
            pi.rowText = `${playerPrefix}#${ch.id}  HP:${ch.combat.health}/${ch.combat.maxHealth}  ${weaponName}(${weaponDmg})  spd:${ch.config.speed}  [${stateLabelOf(ch)}]`
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
        /* 默认按未选中处理：胶囊不透明度置 0（选中后由 refreshSelectionVisibility 恢复；
         * 不能用 visible=false，射线拾取会跳过不可见对象导致无法点选） */
        const spawnMat = mesh.material
        if (Array.isArray(spawnMat)) {
            for (const m of spawnMat) m.opacity = 0
        } else {
            spawnMat.opacity = 0
        }
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
            combat,
            stateMachine,
        }

        bodyCharMap.set(body.handle, entity)
        characters.push(entity)
        appearanceModels.set(entity.id, model)
        appearanceSystems.set(entity.id, createAppearanceSystem({onAttackEvent}))
        weaponTrails.set(entity.id, createWeaponTrail(scene))
        const hitBoxes = createAttackHitBoxes(scene)
        attackHitBoxes.set(entity.id, hitBoxes)
        /* 生成时即定位调试线框（编辑暂停态 update 不运行，避免线框滞留在原点）；
         * 可见性由选中状态驱动（refreshSelectionVisibility），未选中时全部隐藏 */
        placeDebugBoxes(entity, x, y, z, 0)

        const flash = createDamageFlash(entity)
        flashStates.set(entity.id, flash)
        const originalOnDamage = flash.onDamage
        entity.combat.onDamageTaken = (amount: number, event) => {
            originalOnDamage(amount)
            /* 攻击中被击中时标记硬直；受击保护窗口内不再触发，防止无限连段锁死（伤害照常） */
            if (entity.combat.attackActive && entity.combat.health > 0 && entity.combat.flinchImmunityTimer <= 0) {
                entity.combat.pendingFlinch = true
            }
            /* 受击转战斗（仇恨）：被背后/视野外攻击或接敌冷却期内挨打时强制还击 */
            const aiCtx = aiMap.get(entity.id)
            if (aiCtx && entity.combat.health > 0) {
                notifyAIDamaged(aiCtx, entity, characters, event.sourceId)
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
        const meleePreset: AttackConfig = {type: 'melee', damage: wp.damage, cooldown: 0, duration: MELEE_LIGHT_DURATION}
        const entity = spawnEntity(DEFAULT_CHARACTER_CONFIG, meleePreset, {tendencyId: 'hostileExceptSelf'}, 0, x, y, z)
        select(entity.id)
    }

    const syncPositions = (): void => {
        for (const entity of characters) {
            if (entity.combat.isDead) continue
            const pos = entity.body.translation()
            entity.mesh.position.set(pos.x, pos.y, pos.z)
            /* 碰撞箱可视化随身体朝向旋转（物理碰撞体为竖直胶囊，旋转对称不受影响） */
            entity.mesh.rotation.set(0, facingAngles.get(entity.id) ?? 0, 0)
            entity.appearanceGroup.position.set(pos.x, pos.y, pos.z)
            if (entity.isDying) {
                /* 死亡渐隐以选中态不透明度为基线：未选中角色基线为 0（全程不可见，
                 * 避免覆写选中态透明度导致胶囊在死亡时冒出）；选中角色自胶囊固有透明度渐隐 */
                const fade = 1 - entity.dyingTimer / DYING_DURATION
                const base = entity.id === selectedId ? COLLIDER_MESH_OPACITY : 0
                const mat = entity.mesh.material
                if (Array.isArray(mat)) {
                    for (const m of mat) { m.transparent = true; m.opacity = base * fade }
                } else {
                    mat.transparent = true
                    mat.opacity = base * fade
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
        /* 选中变更：刷新胶囊透明度与调试线框归属（仅选中角色显示） */
        refreshSelectionVisibility()
    }
    const getSelectedId = (): number | undefined => selectedId

    /** 定位单个角色的调试线框（受击箱/检测箱或射程圆环/视线扇形）并按当前选中与 debug 开关设可见性，
     * 供生成/面板瞬移（setTransform）/选中切换复用，保证编辑暂停态（update 不运行）线框也随位置同步 */
    const placeDebugBoxes = (entity: CharacterEntity, x: number, y: number, z: number, yaw: number): void => {
        const hitBoxes = attackHitBoxes.get(entity.id)
        if (!hitBoxes) return
        const show = attackHitBoxVisible && entity.id === selectedId
        const th = targetHitBoxHalves(entity.config.scale)
        hitBoxes.targetBox.position.set(x, y, z)
        hitBoxes.targetBox.scale.set(th.x * 2, th.y * 2, th.z * 2)
        hitBoxes.targetBox.rotation.y = yaw
        hitBoxes.targetBox.visible = show
        const skill = entity.combat.skills[entity.combat.currentSkillIndex]?.config
        if (skill !== undefined && skill.type === 'melee') {
            const db = attackDetectOBB({x, y, z}, skill.weapon.detectBox, entity.config.scale, yaw)
            hitBoxes.detectBox.position.set(db.center.x, db.center.y, db.center.z)
            hitBoxes.detectBox.scale.set(db.half.x * 2, db.half.y * 2, db.half.z * 2)
            hitBoxes.detectBox.rotation.y = yaw
            hitBoxes.detectBox.visible = show
        } else {
            hitBoxes.detectBox.visible = false
        }
        if (skill !== undefined && skill.type === 'ranged') {
            /* 射程圆环：半径 = weapon.range，贴足部高度平铺 */
            hitBoxes.rangeRing.position.set(x, y - CHARACTER_BASE_SIZE.height * entity.config.scale / 2, z)
            hitBoxes.rangeRing.scale.set(skill.weapon.range, 1, skill.weapon.range)
            hitBoxes.rangeRing.visible = show
        } else {
            hitBoxes.rangeRing.visible = false
        }
        placeVisionFan(hitBoxes, losChecker, x, y + CHARACTER_BASE_SIZE.height * entity.config.scale * 0.4, z, yaw,
            skill?.weapon.detectionRange ?? 8)
        hitBoxes.visionFan.visible = show
        /* 攻击判定箱（红）需逐帧跟随武器 matrixWorld，暂停态不强行显示，由 update() 维护 */
        if (!show) hitBoxes.weaponBox.visible = false
    }

    /** 刷新选中态可视化：胶囊体/受击箱/检测块/判定箱/检测射线等仅被选中角色显示；
     * 未选中角色胶囊不透明度降为 0（保留 mesh 本身供射线拾取，不能设 visible=false） */
    const refreshSelectionVisibility = (): void => {
        for (const entity of characters) {
            const mat = entity.mesh.material
            const opacity = entity.id === selectedId ? COLLIDER_MESH_OPACITY : 0
            if (Array.isArray(mat)) {
                for (const m of mat) m.opacity = opacity
            } else {
                mat.opacity = opacity
            }
            const hb = attackHitBoxes.get(entity.id)
            if (!hb) continue
            if (attackHitBoxVisible && entity.id === selectedId) {
                const p = entity.body.translation()
                placeDebugBoxes(entity, p.x, p.y, p.z, facingAngles.get(entity.id) ?? 0)
            } else {
                hb.targetBox.visible = false
                hb.weaponBox.visible = false
                hb.detectBox.visible = false
                hb.rangeRing.visible = false
                hb.visionFan.visible = false
            }
        }
    }

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
        attackHitBoxes.get(entity.id)?.dispose()
        attackHitBoxes.delete(entity.id)
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

    const setPlayerAttack = (skillIndex?: number, holdDuration?: number): AttackResult => {
        const player = getPlayerCharacter()
        if (!player || player.combat.isDead) return 'dead'
        const idx = skillIndex ?? 0
        if (idx < 0 || idx >= player.combat.skills.length) return 'no_valid_skill'
        const hold = holdDuration ?? 0
        if (player.combat.attackActive) {
            /* 攻击中不再拒绝：写入单帧脉冲，由 attacking 缓冲逻辑在段末推进（续链/切链） */
            playerAttackPending = true
            playerAttackSkillIndex = idx
            playerAttackHoldDuration = hold
            return 'ok'
        }
        /* 非攻击中：按键组 + 守卫（蓄力/方向）+ 冷却解析起手，无候选才拒绝
         * （不能只查 skills[idx] 冷却：同键组守卫变体与兜底槽冷却相互独立） */
        const entry = resolveEntrySkillIndex(player.combat, idx, {dx: playerDx, dz: playerDz, holdDuration: hold})
        if (entry === -1) return 'cooldown'
        playerAttackPending = true
        playerAttackSkillIndex = idx
        playerAttackHoldDuration = hold
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
            entity.combat.dashSkill.cooldownTimer = Math.max(0, entity.combat.dashSkill.cooldownTimer - dt)
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
                    /* 记录意图方向（过滤前）：驱动朝向持续对准目标/路点，被接触阻断/nav 卡住时
                     * 仍能转正朝向，保证攻击检测箱门控与发射方向可用（过滤后方向会清零导致朝向自锁） */
                    aiTargetDirs.set(entity.id, {dx, dz})
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
                entity.stateMachine.setInput(playerDx, playerDz, playerJump, playerAttackPending, playerSprint, playerAttackSkillIndex, playerAttackHoldDuration)
                if (playerAttackPending) {
                    entity.combat.attackDirX = playerForwardX
                    entity.combat.attackDirZ = playerForwardZ
                }
            }

            entity.stateMachine.update(dt, entity)

            const model = appearanceModels.get(entity.id)
            const sys = appearanceSystems.get(entity.id)
            if (model && sys) {
                /* 计算阶段动画上下文（仅 attacking 状态注入阶段信息） */
                const activeSkill = entity.combat.skills[entity.combat.currentSkillIndex]
                const inAttacking = entity.stateMachine.currentState === 'attacking' && activeSkill !== undefined
                const phases = inAttacking ? resolvePhases(activeSkill.config.phases) : []
                const phaseDuration = entity.combat.phaseIndex < phases.length
                    ? phaseDurationOf(phases[entity.combat.phaseIndex], activeSkill!.config.duration, activeSkill!.config.recovery)
                    : 1
                const totalDuration = activeSkill !== undefined ? activeSkill.config.duration + activeSkill.config.recovery : 1
                const ctxPhaseName = inAttacking && entity.combat.phaseIndex < phases.length
                    ? phases[entity.combat.phaseIndex].name
                    : undefined

                sys.update(dt, model, entity.stateMachine.currentState, {
                    stateTime: entity.stateMachine.stateTime,
                    swingTilt: entity.combat.swingTilt,
                    attackSkillId: inAttacking ? activeSkill!.config.id : undefined,
                    attackPhase: ctxPhaseName,
                    attackPhaseProgress: phaseDuration > 0 ? entity.combat.phaseTimer / phaseDuration : 0,
                    attackTotalProgress: inAttacking && totalDuration > 0 ? entity.combat.attackTimer / totalDuration : 0,
                    attackPhases: inAttacking ? phases : undefined,
                    attackPhaseIndex: entity.combat.phaseIndex,
                    attackDuration: activeSkill?.config.duration ?? 1,
                    attackRecovery: activeSkill?.config.recovery ?? 0,
                    weaponHeld: model.weaponMesh !== null,
                })

                const vx = entity.body.linvel().x
                const vz = entity.body.linvel().z
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
                /* 碰撞箱可视化同步跟随身体朝向 */
                entity.mesh.rotation.y = newAngle

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

                /* 战斗判定调试线框（edit 模式）：红色攻击判定箱（随武器 matrixWorld）、
                 * 青色受击箱、橙色攻击检测箱（随位置/朝向）、蓝色视线扇形，
                 * 几何均与对应判定函数同源，保证所见即所判 */
                const hitBoxes = attackHitBoxes.get(entity.id)
                if (hitBoxes) {
                    /* debug 信息仅被选中角色显示（与 refreshSelectionVisibility 的门控一致） */
                    const showDebug = attackHitBoxVisible && entity.id === selectedId
                    const bPos = entity.body.translation()
                    const yaw = facingAngles.get(entity.id) ?? 0
                    const th = targetHitBoxHalves(entity.config.scale)
                    hitBoxes.targetBox.position.set(bPos.x, bPos.y, bPos.z)
                    hitBoxes.targetBox.scale.set(th.x * 2, th.y * 2, th.z * 2)
                    /* 受击箱随身体朝向旋转（与判定的 OBB 几何一致） */
                    hitBoxes.targetBox.rotation.y = yaw
                    hitBoxes.targetBox.visible = showDebug

                    const meleeSkill = activeSkill !== undefined && activeSkill.config.type === 'melee'
                        ? activeSkill.config
                        : undefined

                    /* 攻击判定箱（红）：跟随武器模型位姿，尺寸 = 武器本地命中箱 */
                    if (showDebug && meleeSkill !== undefined && model.weaponGroup !== null && model.weaponHitBox !== null) {
                        model.weaponGroup.updateMatrixWorld()
                        syncWeaponDebugBox(hitBoxes.weaponBox, model.weaponGroup.matrixWorld,
                            model.weaponHitBox.center, model.weaponHitBox.half)
                        hitBoxes.weaponBox.visible = true
                    } else {
                        hitBoxes.weaponBox.visible = false
                    }

                    /* 攻击检测箱（橙）：与角色位置/朝向绑定，尺寸与偏移由武器 detectBox 配置驱动 */
                    if (showDebug && meleeSkill !== undefined) {
                        const db = attackDetectOBB(bPos, meleeSkill.weapon.detectBox, entity.config.scale, yaw)
                        hitBoxes.detectBox.position.set(db.center.x, db.center.y, db.center.z)
                        hitBoxes.detectBox.scale.set(db.half.x * 2, db.half.y * 2, db.half.z * 2)
                        hitBoxes.detectBox.rotation.y = yaw
                        hitBoxes.detectBox.visible = true
                    } else {
                        hitBoxes.detectBox.visible = false
                    }

                    /* 射程圆环（橙）：远程出招门控为圆形距离判定 dist <= weapon.range，贴足部高度平铺 */
                    const rangedSkill = activeSkill !== undefined && activeSkill.config.type === 'ranged'
                        ? activeSkill.config
                        : undefined
                    if (showDebug && rangedSkill !== undefined) {
                        hitBoxes.rangeRing.position.set(bPos.x, bPos.y - CHARACTER_BASE_SIZE.height * entity.config.scale / 2, bPos.z)
                        hitBoxes.rangeRing.scale.set(rangedSkill.weapon.range, 1, rangedSkill.weapon.range)
                        hitBoxes.rangeRing.visible = true
                    } else {
                        hitBoxes.rangeRing.visible = false
                    }

                    /* 视线扇形（蓝）：每 10° 一条扫描射线（截断到遮挡点），战斗目标存在时画连线 */
                    if (showDebug) {
                        const eyeY = bPos.y + CHARACTER_BASE_SIZE.height * entity.config.scale * 0.4
                        const fanLen = activeSkill?.config.weapon.detectionRange ?? 8
                        let tx: number | undefined
                        let ty: number | undefined
                        let tz: number | undefined
                        if (aiCtx && aiCtx.activeFsm === 'combat' && aiCtx.combatTargetId !== undefined) {
                            const target = characters.find(c => c.id === aiCtx.combatTargetId)
                            if (target && !target.combat.isDead) {
                                const tp = target.body.translation()
                                tx = tp.x
                                ty = tp.y + CHARACTER_BASE_SIZE.height * target.config.scale * 0.4
                                tz = tp.z
                            }
                        }
                        placeVisionFan(hitBoxes, losChecker, bPos.x, eyeY, bPos.z, yaw, fanLen, tx, ty, tz)
                        hitBoxes.visionFan.visible = true
                    } else {
                        hitBoxes.visionFan.visible = false
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
        playerAttackHoldDuration = 0
        playerJump = false
        playerSprint = false

        rangedExecutor.updateBullets(dt, characters)

        for (let i = characters.length - 1; i >= 0; i--) {
            if (characters[i].combat.isDead) remove(characters[i].id)
        }

        /* 列表行状态实时刷新（状态机/AI 状态每帧可能变化） */
        refreshPlayerLabel()
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
                    losChecker,
                    DEFAULT_PEACE_CONFIGS[entity.peaceStrategy],
                    entity.combatStrategy,
                    /* 攻击检测箱：与角色位置/朝向绑定、尺寸与偏移由武器 detectBox 配置驱动的前侧方立方体；
                     * 远程不适用检测箱，回退圆形距离判定 */
                    (character, target) => {
                        const skill = character.combat.skills[character.combat.currentSkillIndex]
                        if (!skill) return false
                        const cPos = character.body.translation()
                        const tPos = target.body.translation()
                        if (skill.config.type !== 'melee') {
                            return Math.hypot(tPos.x - cPos.x, tPos.z - cPos.z) <= skill.config.weapon.range
                        }
                        return testAttackDetect(
                            cPos, skill.config.weapon.detectBox, character.config.scale, facingAngles.get(character.id) ?? 0,
                            tPos, target.config.scale, facingAngles.get(target.id) ?? 0,
                        )
                    },
                    /* 视线扇形门控用的实时朝向（findNearestEnemy 每帧读取） */
                    () => facingAngles.get(entity.id) ?? 0,
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
        /* 外观动画体一同瞬移（暂停态 syncPositions 不运行，否则模型滞留旧位置） */
        entity.appearanceGroup.position.set(pos.x, pos.y, pos.z)
        placeDebugBoxes(entity, pos.x, pos.y, pos.z, facingAngles.get(id) ?? 0)
    }

    const getFacing = (id: number): number => {
        const rad = facingAngles.get(id) ?? 0
        let deg = (rad * 180 / Math.PI) % 360
        if (deg < 0) deg += 360
        return Math.round(deg * 10) / 10
    }

    const setFacing = (id: number, degrees: number): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        const normalized = ((degrees % 360) + 360) % 360
        const yaw = normalized * Math.PI / 180
        facingAngles.set(id, yaw)
        /* 暂停态 update 不运行，碰撞胶囊与外观模型立即同步朝向 */
        entity.mesh.rotation.set(0, yaw, 0)
        const model = appearanceModels.get(id)
        if (model) model.group.rotation.y = yaw
        const p = entity.body.translation()
        placeDebugBoxes(entity, p.x, p.y, p.z, yaw)
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
        attackHitBoxVisible = visible
        for (const entity of characters) {
            entity.mesh.visible = visible
        }
        /* 按选中状态重刷全部调试线框可见性（关闭时全部隐藏，开启时仅选中角色显示） */
        refreshSelectionVisibility()
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
        getFacing,
        setFacing,
        setupAI,
        setNavEnabled,
        setOnMeleeImpact,
    }

    return {
        ...ctxWithoutPanel,
        panel: createCharacterPanel(ctxWithoutPanel),
    }
}
