import {Euler, type LineBasicMaterial, type Mesh, Quaternion, type Scene, Vector3} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../physics/world.ts'
import {createColliderForBody, setBodyMass} from '../../../physics/rapier_utils.ts'
import {type ContactTracker, createContactTracker, queryColliderContacts} from '../../../physics/contact_tracking.ts'
import type {CharacterConfig, CharacterEntity} from '../../../character/types.ts'
import type {AttackConfig} from '../../../character/archetypes.ts'
import type {TendencyConfig} from '../../../character/faction.ts'
import {resolveTendency} from '../../../character/faction.ts'
import type {AttackResult} from '../../../character/combat/types.ts'
import {createCombatComponent, setCombatWeapon} from '../../../character/combat/types.ts'
import {canStartAttack, tickSegmentCooldowns} from '../../../character/combat/attack_runtime.ts'
import {createTestWeaponRuntime, TEST_WEAPON_ID} from '../../../character/combat/test_weapon.ts'
import {createWeaponRuntime, type WeaponRuntime} from '../../../character/weapon/weapon_runtime.ts'
import {defaultHoldMode, weaponAttacksOf} from '../../../character/weapon/catalog.ts'
import type {HoldMode} from '../../../character/weapon/hold_mode.ts'
import type {AttackKey} from '../../../character/weapon/attack_chain.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'
import {DYING_DURATION} from '../../../character/state_machine/states/dying.ts'
import type {AIContext, SpawnBoxCallback} from '../ai/types.ts'
import type {CombatSubStrategy, PeaceSubStrategy} from '../../../character/ai_strategy/types.ts'
import type {PeaceConfig} from '../../../character/ai_strategy/peace.ts'
import {DEFAULT_PEACE_CONFIGS} from '../../../character/ai_strategy/peace.ts'
import {DEFAULT_COMBAT_CONFIGS} from '../../../character/ai_strategy/combat.ts'
import {createNavSensor, type NavSensor} from '../ai/nav/sensor.ts'
import {createLineOfSightChecker, type LineOfSightChecker} from '../ai/line_of_sight.ts'
import {createAIMachine, notifyAIDamaged, updateAI} from '../ai/machine.ts'
import {processNav} from '../ai/nav/machine.ts'
import {createCharacterMesh, updateCharacterMesh} from '../render'
import {COLLIDER_MESH_OPACITY} from '../render/constants.ts'
import {createCharacterModel} from '../appearance/model.ts'
import type {AppearanceSystem} from '../appearance/system.ts'
import {createAppearanceSystem} from '../appearance/system.ts'
import {createWeaponTrail, type WeaponTrail} from '../appearance/weapon_trail.ts'
import type {CharacterModel} from '../appearance/types.ts'
import type {BoneEventRecord} from '../../../skeleton/anim/types.ts'
import {ROTATION_SPEED, SELECT_PALETTE, VELOCITY_DIR_THRESHOLD} from '../appearance/constants.ts'
import {DEFAULT_CHARACTER_CONFIG} from '../validation.ts'
import {CHARACTER_BASE_SIZE, CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK} from '../constants.ts'
import {categoryCollisionGroups} from '../../../physics/collision_category.ts'
import {CHARACTER_LINEAR_DAMPING, CHARACTER_SEPARATION_SPEED} from './constants.ts'
import type {GroundContactLike} from './ground_state.ts'
import {resolveGroundState} from './ground_state.ts'
import {computeSeparation, separationSlopeDy} from './separation.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import {getSkillExecutor, registerSkillExecutor} from '../../../character/combat/executor.ts'
import {attackDetectOBB, createMeleeExecutor, targetHitBoxHalves, testAttackDetect} from '../combat/melee_executor.ts'
import {createRangedExecutor} from '../combat/ranged_executor.ts'
import {HITSTOP_DURATION, HITSTOP_TIMESCALE} from '../combat/constants.ts'
import {createDamageFlash} from '../combat_vfx/damage_flash.ts'
import {type AttackHitBoxes, createAttackHitBoxes, syncWeaponDebugBox} from '../combat_vfx/hitbox_debug.ts'
import {VISION_FAN_HALF_ANGLE, VISION_FAN_RAY_COUNT, VISION_FAN_RAY_STEP} from '../ai/constants.ts'
import type {EntityInfoSource, EntityPanelInfo} from '../../box/base/types/entity_info.ts'
import {createEmitter} from '../../box/base/types/event_emitter.ts'
import {cleanupWireframe, createWireframe} from '../../box/base/render'
import {createCharacterPanel} from '../ui/panel.ts'
import {phaseDurationOf, resolvePhases} from '../../../character/combat/attack_phases.ts'

/** Rapier 带 body/bodyHandle 反查的超类型 */
type CharacterRigidBody = RAPIER.RigidBody

/** 刀光轨迹刀尖采样复用向量（避免每帧分配） */
const _trailTipVec = new Vector3()

/** 角色朝向提取复用对象（将旋转后的前向量投影到水平面求朝向，避免每帧分配） */
const _facingForward = new Vector3()
const _facingQuat = new Quaternion()
const _facingEuler = new Euler()

/** 死亡倒下合成复用对象（绕「上 × 倒向」轴旋转 dyingFallAngle 再叠加朝向，避免每帧分配） */
const _deathFallAxis = new Vector3()
const _deathFallQuat = new Quaternion()
const _deathYawQuat = new Quaternion()
const _upAxis = new Vector3(0, 1, 0)

/** 根据 AttackConfig 解析武器运行时（武器预设 + 数值覆写；test_weapon 走测试专用链） */
const weaponRuntimeOf = (attack: AttackConfig, holdMode?: HoldMode): WeaponRuntime => {
    if (attack.weaponId === TEST_WEAPON_ID) return createTestWeaponRuntime(holdMode)
    return createWeaponRuntime(attack.weaponId, {
        damage: attack.damage,
        cooldown: attack.cooldown,
        ranged: attack.ranged,
    }, holdMode)
}

/** 由已覆写武器重建运行时（换持握模式用；武器对象已含覆写，仅按模式重解析攻击链） */
const runtimeForHoldMode = (weapon: WeaponRuntime['weapon'], holdMode: HoldMode): WeaponRuntime => ({
    weapon,
    holdMode,
    attacks: weaponAttacksOf(weapon, holdMode),
})

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

/** 角色实体原点（脚底）到物理刚体中心（胶囊中心）的 Y 向偏移 */
const originToCenterY = (config: CharacterConfig): number =>
    (CHARACTER_BASE_SIZE.height * config.scale) / 2

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
    setPlayerAttack: (attackKey?: AttackKey, holdDuration?: number) => import('../../../character/combat/types.ts').AttackResult
    getPlayerCharacter: () => CharacterEntity | undefined
    getHostileTo: (faction: number) => CharacterEntity[]
    getCharacterByBody: (body: CharacterRigidBody) => CharacterEntity | undefined
    update: (dt: number) => void
    setAIEnabled: (enabled: boolean) => void
    activateAI: () => void
    add: (config: CharacterSaveConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, opts?: {health?: number}) => {id: number}
    getAll: () => readonly CharacterEntity[]
    setTransform: (id: number, pos: {x: number; y: number; z: number}, rotDeg: {x: number; y: number; z: number}) => void
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
    /** 切换持握模式（武器不支持时回退默认模式）；返回是否成功命中请求的模式 */
    setHoldMode: (id: number, holdMode: HoldMode) => boolean
    /** 配置 AI 感知（视线检查 + 导航传感器，需在所有实体系统初始化后调用） */
    setupAI: (systems: readonly EntityInfoSource[]) => void
    /** 设置单角色导航感知开关 */
    setNavEnabled: (id: number, enabled: boolean) => void
    /** 设置近战命中冲击监听器（参数为命中点世界坐标，null 清除） */
    setOnMeleeImpact: (listener: ((x: number, y: number, z: number) => void) | null) => void
    /** 清除执行期产生的全部子弹（子弹是战斗期临时对象、不进存档，世界还原/载入时必须显式清理） */
    clearBullets: () => void
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

    /** 清除全部在飞子弹（同时移除物理刚体与场景 mesh），供世界还原 / 载入存档时调用 */
    const clearBullets = (): void => { rangedExecutor.clear() }
    /* 攻击动画事件轨道 → 近战命中窗口（hitbox_on/off，与视觉动画同步）；
     * 事件 params.weapon 指定主手/副手（双持），缺省 = 两手同时开关（如状态切换的合成关闭事件） */
    const onAttackEvent = (record: BoneEventRecord): void => {
        const slot = record.params?.weapon === 'offhand' ? 'offhand'
            : record.params?.weapon === 'main' ? 'main'
            : undefined
        if (record.eventName === 'hitbox_on') meleeExecutor.setHitWindow(true, slot)
        if (record.eventName === 'hitbox_off') meleeExecutor.setHitWindow(false, slot)
    }
    /** 追踪当前激活的近战攻击（用于 start/end 生命周期） */
    const activatedAttacks = new Set<number>()
    /** 受击闪红状态 */
    const flashStates = new Map<number, ReturnType<typeof createDamageFlash>>()
    const noopExecCtx: import('../../../character/combat/executor.ts').ExecutorContext = {
        fireProjectile: () => {},
    }

    /** 玩家攻击脉冲携带的攻击键组（帧末与脉冲一同归零） */
    let playerAttackKey: AttackKey | undefined = undefined
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
            const weapon = ch.combat.weapon
            /* 列表侧栏（`ui/element_list_panel.ts`）展示武器中文名，与角色面板武器下拉同源（武器预设 `name` 字段） */
            const weaponName = weapon.name
            const weaponDmg = weapon.damage
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
        attack: AttackConfig,
        tendencyConfig: TendencyConfig,
        faction: number,
        x: number, y: number, z: number,
        isPlayer?: boolean,
        peaceStrategy: PeaceSubStrategy = 'patrol',
        combatStrategy: CombatSubStrategy = 'tactical',
        navEnabled: boolean = true,
    ): CharacterEntity => {
        /* 武器运行时（武器预设 + 存档数值覆写）：外观武器模型、攻击链、血量档位都由它决定 */
        const runtime = weaponRuntimeOf(attack)
        const mesh = createCharacterMesh(config)
        /* 实体原点在脚底：mesh/外观模型定位到原点，物理刚体（胶囊）中心上移半高 */
        const halfH = originToCenterY(config)
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
        model.equipWeapon({main: runtime.weapon.mesh, offhand: runtime.weapon.offhandMesh})
        model.group.position.set(x, y, z)
        scene.add(model.group)

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .lockRotations()
            .setLinearDamping(CHARACTER_LINEAR_DAMPING)
            .setTranslation(x, y + halfH, z)
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
            .setCollisionGroups(categoryCollisionGroups(CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK, 'character'))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        const mainCollider = createColliderForBody(world, colliderDesc, body)
        /* 质量恒为 1（对齐 cannon-es master）：击退/磁力/浮力均按 mass=1 计算。
         * 不设置的话 Rapier 按密度 1 × 体积（≈0.04）计算，击退冲量会被放大 25 倍 */
        setBodyMass(body, 1)

        const id = nextId++
        const stateMachine = createCharacterStateMachine()
        const maxHP = runtime.weapon.type === 'melee' ? 15 : 8

        const combat = createCombatComponent(
            runtime, faction,
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
            dyingFallDirX: 0,
            dyingFallDirZ: 0,
            dyingFallAngle: 0,
            combat,
            holdMode: defaultHoldMode(runtime.weapon),
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
         * 可见性由选中状态驱动（refreshSelectionVisibility），未选中时全部隐藏；
         * placeDebugBoxes 接收的是物理中心坐标 */
        placeDebugBoxes(entity, x, y + halfH, z, 0)

        const flash = createDamageFlash(entity)
        flashStates.set(entity.id, flash)
        const originalOnDamage = flash.onDamage
        entity.combat.onDamageTaken = (amount: number, event) => {
            originalOnDamage(amount)
            /* 记录冲击方向（死亡倒向依据）：伤害事件携带世界水平单位向量，仅在有效方向时覆盖旧值 */
            if (event.dirX !== undefined && event.dirZ !== undefined && (event.dirX !== 0 || event.dirZ !== 0)) {
                entity.combat.lastHitDirX = event.dirX
                entity.combat.lastHitDirZ = event.dirZ
            }
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
        const meleePreset: AttackConfig = {weaponId: 'long_sword'}
        const entity = spawnEntity(DEFAULT_CHARACTER_CONFIG, meleePreset, {tendencyId: 'hostileExceptSelf'}, 0, x, y, z)
        select(entity.id)
    }

    const syncPositions = (): void => {
        for (const entity of characters) {
            if (entity.combat.isDead) continue
            const pos = entity.body.translation()
            /* 实体原点在脚底：物理中心回退半高得到原点 Y */
            const originY = pos.y - originToCenterY(entity.config)
            entity.mesh.position.set(pos.x, originY, pos.z)
            /* 碰撞箱可视化随身体朝向旋转（物理碰撞体为竖直胶囊，旋转对称不受影响） */
            entity.mesh.rotation.set(0, facingAngles.get(entity.id) ?? 0, 0)
            entity.appearanceGroup.position.set(pos.x, originY, pos.z)
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
        const weapon = entity.combat.weapon
        if (weapon.type === 'melee') {
            const db = attackDetectOBB({x, y, z}, weapon.detectBox, entity.config.scale, yaw)
            hitBoxes.detectBox.position.set(db.center.x, db.center.y, db.center.z)
            hitBoxes.detectBox.scale.set(db.half.x * 2, db.half.y * 2, db.half.z * 2)
            hitBoxes.detectBox.rotation.y = yaw
            hitBoxes.detectBox.visible = show
        } else {
            hitBoxes.detectBox.visible = false
        }
        if (weapon.type === 'ranged') {
            /* 射程圆环：半径 = weapon.range，贴足部高度平铺 */
            hitBoxes.rangeRing.position.set(x, y - CHARACTER_BASE_SIZE.height * entity.config.scale / 2, z)
            hitBoxes.rangeRing.scale.set(weapon.range, 1, weapon.range)
            hitBoxes.rangeRing.visible = show
        } else {
            hitBoxes.rangeRing.visible = false
        }
        placeVisionFan(hitBoxes, losChecker, x, y + CHARACTER_BASE_SIZE.height * entity.config.scale * 0.4, z, yaw,
            weapon.detectionRange)
        hitBoxes.visionFan.visible = show
        /* 攻击判定箱（红）需逐帧跟随武器 matrixWorld，暂停态不强行显示，由 update() 维护 */
        if (!show) {
            hitBoxes.weaponBox.visible = false
            hitBoxes.offhandWeaponBox.visible = false
        }
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
                hb.offhandWeaponBox.visible = false
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
            const executor = getSkillExecutor(entity.combat.weapon.type)
            executor?.end(entity.combat, entity, noopExecCtx)
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

    const setPlayerAttack = (attackKey?: AttackKey, holdDuration?: number): AttackResult => {
        const player = getPlayerCharacter()
        if (!player || player.combat.isDead) return 'dead'
        const key: AttackKey = attackKey ?? 'light'
        const hold = holdDuration ?? 0
        if (player.combat.attackActive) {
            /* 攻击中不再拒绝：写入单帧脉冲，由 attacking 段转换在段末推进（同键续链/异键切链） */
            playerAttackPending = true
            playerAttackKey = key
            playerAttackHoldDuration = hold
            return 'ok'
        }
        /* 非攻击中：按键起手解析（起手候选守卫 + 冷却），无候选才拒绝 */
        const canStart = canStartAttack(player.combat, {dx: playerDx, dz: playerDz, holdDuration: hold, attackKey: key})
        if (!canStart) return 'cooldown'
        playerAttackPending = true
        playerAttackKey = key
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

            /* 段冷却逐帧递减（只挡起手，链推进不查冷却） */
            tickSegmentCooldowns(entity.combat, dt)
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
                            /* 仅当 AI 输入方向指向接触对方时阻断，允许沿接触面滑开 */
                            const obPos = otherBody.translation()
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

                    entity.stateMachine.setInput(finalDX, finalDZ, jump, attack, false, 'light')
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
                entity.stateMachine.setInput(playerDx, playerDz, playerJump, playerAttackPending, playerSprint, playerAttackKey, playerAttackHoldDuration)
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
                /* 计算阶段动画上下文（仅 attacking 状态注入当前段信息） */
                const activeSegment = entity.combat.activeSegment
                const inAttacking = entity.stateMachine.currentState === 'attacking' && activeSegment !== undefined
                const phases = inAttacking ? resolvePhases(activeSegment.phases) : []
                const phaseDuration = inAttacking && entity.combat.phaseIndex < phases.length
                    ? phaseDurationOf(phases[entity.combat.phaseIndex], activeSegment.duration, activeSegment.recovery)
                    : 1
                const totalDuration = activeSegment !== undefined ? activeSegment.duration + activeSegment.recovery : 1
                const ctxPhaseName = inAttacking && entity.combat.phaseIndex < phases.length
                    ? phases[entity.combat.phaseIndex].name
                    : undefined

                sys.update(dt, model, entity.stateMachine.currentState, {
                    stateTime: entity.stateMachine.stateTime,
                    horizontalSpeed: hSpeed,
                    holdMode: entity.holdMode,
                    attackSegment: inAttacking ? activeSegment : undefined,
                    attackPhase: ctxPhaseName,
                    attackPhaseProgress: phaseDuration > 0 ? entity.combat.phaseTimer / phaseDuration : 0,
                    attackTotalProgress: inAttacking && totalDuration > 0 ? entity.combat.attackTimer / totalDuration : 0,
                    attackPhaseIndex: entity.combat.phaseIndex,
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
                if (entity.isDying) {
                    /* 死亡倒下：绕世界轴「上 × 倒向」旋转 dyingFallAngle（方向/角度由 dying state 决定），
                     * 再叠加保持的最后朝向；模型原点在脚底，因此以脚为支点倒向冲击方向 */
                    _deathFallAxis.set(entity.dyingFallDirZ, 0, -entity.dyingFallDirX)
                    if (_deathFallAxis.lengthSq() > 1e-8) {
                        _deathFallAxis.normalize()
                        _deathFallQuat.setFromAxisAngle(_deathFallAxis, entity.dyingFallAngle)
                        _deathYawQuat.setFromAxisAngle(_upAxis, newAngle)
                        model.group.quaternion.copy(_deathFallQuat).multiply(_deathYawQuat)
                    } else {
                        model.group.rotation.set(0, newAngle, 0)
                    }
                } else {
                    /* 运行时朝向仅绕 Y（清除编辑态可能残留的 X/Z 视觉倾斜） */
                    model.group.rotation.set(0, newAngle, 0)
                }
                /* 碰撞箱可视化同步跟随身体朝向 */
                entity.mesh.rotation.set(0, newAngle, 0)

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

                    const debugWeapon = entity.combat.weapon
                    const meleeWeapon = debugWeapon.type === 'melee' ? debugWeapon : undefined

                    /* 攻击判定箱（红）：跟随武器模型位姿，尺寸 = 武器本地命中箱 */
                    if (showDebug && meleeWeapon !== undefined && model.weaponGroup !== null && model.weaponHitBox !== null) {
                        model.weaponGroup.updateMatrixWorld()
                        syncWeaponDebugBox(hitBoxes.weaponBox, model.weaponGroup.matrixWorld,
                            model.weaponHitBox.center, model.weaponHitBox.half)
                        hitBoxes.weaponBox.visible = true
                    } else {
                        hitBoxes.weaponBox.visible = false
                    }

                    /* 副手攻击判定箱（双持）：跟随副手武器模型 */
                    if (showDebug && meleeWeapon !== undefined && model.offhandWeaponGroup !== null && model.offhandWeaponHitBox !== null) {
                        model.offhandWeaponGroup.updateMatrixWorld()
                        syncWeaponDebugBox(hitBoxes.offhandWeaponBox, model.offhandWeaponGroup.matrixWorld,
                            model.offhandWeaponHitBox.center, model.offhandWeaponHitBox.half)
                        hitBoxes.offhandWeaponBox.visible = true
                    } else {
                        hitBoxes.offhandWeaponBox.visible = false
                    }

                    /* 攻击检测箱（橙）：与角色位置/朝向绑定，尺寸与偏移由武器 detectBox 配置驱动 */
                    if (showDebug && meleeWeapon !== undefined) {
                        const db = attackDetectOBB(bPos, meleeWeapon.detectBox, entity.config.scale, yaw)
                        hitBoxes.detectBox.position.set(db.center.x, db.center.y, db.center.z)
                        hitBoxes.detectBox.scale.set(db.half.x * 2, db.half.y * 2, db.half.z * 2)
                        hitBoxes.detectBox.rotation.y = yaw
                        hitBoxes.detectBox.visible = true
                    } else {
                        hitBoxes.detectBox.visible = false
                    }

                    /* 射程圆环（橙）：远程出招门控为圆形距离判定 dist <= weapon.range，贴足部高度平铺 */
                    if (showDebug && debugWeapon.type === 'ranged') {
                        hitBoxes.rangeRing.position.set(bPos.x, bPos.y - CHARACTER_BASE_SIZE.height * entity.config.scale / 2, bPos.z)
                        hitBoxes.rangeRing.scale.set(debugWeapon.range, 1, debugWeapon.range)
                        hitBoxes.rangeRing.visible = true
                    } else {
                        hitBoxes.rangeRing.visible = false
                    }

                    /* 视线扇形（蓝）：每 10° 一条扫描射线（截断到遮挡点），战斗目标存在时画连线 */
                    if (showDebug) {
                        const eyeY = bPos.y + CHARACTER_BASE_SIZE.height * entity.config.scale * 0.4
                        const fanLen = debugWeapon.detectionRange
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
                const executor = getSkillExecutor(entity.combat.weapon.type)
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
                        executor.start(entity.combat, entity, dirVec, noopExecCtx)
                    }
                    executor.update(dt, entity.combat, entity, noopExecCtx)
                }
            } else if (activatedAttacks.has(entity.id)) {
                activatedAttacks.delete(entity.id)
                const executor = getSkillExecutor(entity.combat.weapon.type)
                executor?.end(entity.combat, entity, noopExecCtx)
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
            ai.mesh.position.set(aAfter.x, aAfter.y - originToCenterY(ai.config), aAfter.z)
            ai.appearanceGroup.position.set(aAfter.x, aAfter.y - originToCenterY(ai.config), aAfter.z)
            const bAfter = bodyB.translation()
            aj.mesh.position.set(bAfter.x, bAfter.y - originToCenterY(aj.config), bAfter.z)
            aj.appearanceGroup.position.set(bAfter.x, bAfter.y - originToCenterY(aj.config), bAfter.z)

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
                        const weapon = character.combat.weapon
                        const cPos = character.body.translation()
                        const tPos = target.body.translation()
                        if (weapon.type !== 'melee') {
                            return Math.hypot(tPos.x - cPos.x, tPos.z - cPos.z) <= weapon.range
                        }
                        return testAttackDetect(
                            cPos, weapon.detectBox, character.config.scale, facingAngles.get(character.id) ?? 0,
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
        const entity = spawnEntity(cfg, saveConfig.attack, saveConfig.tendency, saveConfig.faction, x, y, z, saveConfig.isPlayer, saveConfig.peaceStrategy ?? 'patrol', saveConfig.combatStrategy ?? 'tactical', saveConfig.navEnabled ?? true)
        /* 持握模式：存档支持时应用，武器不支持时 setHoldMode 回退默认模式（不抛错） */
        if (saveConfig.holdMode !== undefined) setHoldMode(entity.id, saveConfig.holdMode)
        entity.combat.maxHealth = saveConfig.maxHealth
        entity.combat.health = opts?.health ?? saveConfig.maxHealth
        if (quat) entity.body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true)
        /* spawnEntity 之后 maxHealth/health 才被覆盖，需再次刷新列表行 */
        refreshPlayerLabel()
        return {id: entity.id}
    }

    const setTransform = (id: number, pos: {x: number; y: number; z: number}, rotDeg: {x: number; y: number; z: number}): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        /* pos 为脚底原点：物理刚体（胶囊）中心上移半高 */
        const halfH = originToCenterY(entity.config)
        entity.body.setTranslation({ x: pos.x, y: pos.y + halfH, z: pos.z }, true)
        entity.mesh.position.set(pos.x, pos.y, pos.z)
        /* 外观动画体一同瞬移（暂停态 syncPositions 不运行，否则模型滞留旧位置） */
        entity.appearanceGroup.position.set(pos.x, pos.y, pos.z)
        /* 朝向：gizmo 旋转弧映射到角色朝向角。
         * rotDeg 为 XYZ 欧拉角（可能是完整旋转的分解，X/Z 为视觉倾斜）。
         * 必须先按 XYZ 顺序合成四元数、再投影前向量求水平朝向：
         * 纯绕 Y 旋转超过 90° 时欧拉 XYZ 会退化为 x=180,y=180-θ,z=180，
         * 若直接取 rotDeg.y 会把朝向压缩到 ±90°、无法转满 360°。 */
        _facingEuler.set(
            rotDeg.x * Math.PI / 180,
            rotDeg.y * Math.PI / 180,
            rotDeg.z * Math.PI / 180,
            'XYZ',
        )
        _facingQuat.setFromEuler(_facingEuler)
        _facingForward.set(0, 0, 1).applyQuaternion(_facingQuat)
        const yaw = Math.atan2(_facingForward.x, _facingForward.z)
        facingAngles.set(id, yaw)
        entity.mesh.quaternion.copy(_facingQuat)
        const model = appearanceModels.get(id)
        if (model) model.group.quaternion.copy(_facingQuat)
        placeDebugBoxes(entity, pos.x, pos.y + halfH, pos.z, yaw)
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
        if (model) model.group.rotation.set(0, yaw, 0)
        const p = entity.body.translation()
        placeDebugBoxes(entity, p.x, p.y, p.z, yaw)
    }

    /**
     * 切换持握模式：武器支持时切换，不支持时回退默认模式；返回是否成功命中请求的模式。
     * 切换后按新模式重解析攻击链并清空段冷却 / 当前段（避免残留旧链的段）。
     */
    const setHoldMode = (id: number, holdMode: HoldMode): boolean => {
        const entity = characters.find(c => c.id === id)
        if (entity === undefined) return false
        const supported = entity.combat.weapon.holdModes.includes(holdMode)
        const mode = supported ? holdMode : defaultHoldMode(entity.combat.weapon)
        if (entity.holdMode !== mode) {
            setCombatWeapon(entity.combat, runtimeForHoldMode(entity.combat.weapon, mode))
            entity.holdMode = mode
            entity.combat.activeSegment = undefined
            entity.combat.bufferedSegment = undefined
            entity.combat.segmentCooldowns.clear()
        }
        return supported
    }

    const updateCharacterConfig = (id: number, charCfg: Partial<CharacterConfig>, newAttackSlot?: AttackConfig, newFaction?: number, newMaxHealth?: number, newTendencyConfig?: TendencyConfig, newHealth?: number): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        if (charCfg.speed !== undefined) entity.config.speed = charCfg.speed
        if (charCfg.jumpHeight !== undefined) entity.config.jumpHeight = charCfg.jumpHeight
        if (charCfg.scale !== undefined) {
            /* 脚底原点锚定：先记录旧原点 Y，scale 变更后物理中心按新半高重定位（脚底不动） */
            const bodyPos = entity.body.translation()
            const originY = bodyPos.y - originToCenterY(entity.config)
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
                .setCollisionGroups(categoryCollisionGroups(CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK, 'character'))
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
            entity.mainCollider = createColliderForBody(world, colliderDesc, entity.body)
            /* 重建后刷新总质量（碰撞体密度 0，质量仍为 1） */
            setBodyMass(entity.body, 1)
            entity.body.wakeUp()
            /* 物理中心随新半高上移，mesh/外观模型原点（脚底）保持不变 */
            entity.body.setTranslation({ x: bodyPos.x, y: originY + originToCenterY(entity.config), z: bodyPos.z }, true)

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
            /* 换装：整体替换武器运行时（武器 + 攻击链 + 数值覆写），持握模式重置为默认，清空段冷却与当前段 */
            const runtime = weaponRuntimeOf(newAttackSlot)
            setCombatWeapon(entity.combat, runtime)
            entity.holdMode = runtime.holdMode
            entity.combat.activeSegment = undefined
            entity.combat.bufferedSegment = undefined
            entity.combat.segmentCooldowns.clear()
            const model = appearanceModels.get(entity.id)
            if (model) {
                model.equipWeapon({main: entity.combat.weapon.mesh, offhand: entity.combat.weapon.offhandMesh})
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
        setHoldMode,
        setupAI,
        setNavEnabled,
        setOnMeleeImpact,
        clearBullets,
    }

    return {
        ...ctxWithoutPanel,
        panel: createCharacterPanel(ctxWithoutPanel),
    }
}
