import {Euler, type LineBasicMaterial, type Mesh, type Object3D, Quaternion, type Scene, Vector3} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../physics/world.ts'
import {createColliderForBody, setBodyMass} from '../../../physics/rapier_utils.ts'
import {type ContactTracker, createContactTracker, queryColliderContacts} from '../../../physics/contact_tracking.ts'
import type {CharacterConfig, CharacterEntity} from '../../../character/types.ts'
import {moveSpeedOf} from '../../../character/types.ts'
import type {AttackConfig} from '../../../character/archetypes.ts'
import type {TendencyConfig} from '../../../character/faction.ts'
import {resolveTendency} from '../../../character/faction.ts'
import type {AttackResult} from '../../../character/combat/types.ts'
import {createCombatComponent, setCombatEquipment, setCombatOffhand, setCombatWeapon} from '../../../character/combat/types.ts'
import {ZERO_PROFILE, type DefenseProfile} from '../../../character/combat/defense.ts'
import type {ArmorLoadout, LimbLoadout} from '../../../character/armor/types.ts'
import {resolveArmorLoadout, resolveLimbLoadout} from '../../../character/armor/catalog.ts'
import {canStartAttack, tickSegmentCooldowns} from '../../../character/combat/attack_runtime.ts'
import {createTestWeaponRuntime, TEST_WEAPON_ID} from '../../../character/combat/test_weapon.ts'
import {createWeaponRuntime, isKnownWeaponId, type WeaponRuntime} from '../../../character/weapon/weapon_runtime.ts'
import {availableHoldModes, defaultHoldMode, weaponAttacksOf, weaponDisplayName} from '../../../character/weapon/catalog.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'
import type {HoldMode} from '../../../character/weapon/hold_mode.ts'
import {DEFAULT_HANDEDNESS, isHandedness} from '../../../character/handedness.ts'
import type {ShieldBlockConfig} from '../../../character/weapon/constants.ts'
import {sanitizeLockPoints, type LockPointConfig} from '../../../character/lock_point.ts'
import {segmentTotalDuration, isChargeableKey, type AttackKey, type GroundAttackKey} from '../../../character/weapon/attack_chain.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'
import {isAirborneAttackState} from '../../../character/state_machine/states/air_attacking.ts'
import type {CharacterState} from '../../../character/state_machine/types.ts'
import {DYING_DURATION} from '../../../character/state_machine/states/dying.ts'
import type {AIContext, CombatState, PeaceState, SpawnBoxCallback} from '../ai/types.ts'
import type {CombatSubStrategy, PeaceSubStrategy} from '../../../character/ai_strategy/types.ts'
import type {PeaceConfig} from '../../../character/ai_strategy/peace.ts'
import {DEFAULT_PEACE_CONFIGS} from '../../../character/ai_strategy/peace.ts'
import {DEFAULT_COMBAT_CONFIGS} from '../../../character/ai_strategy/combat.ts'
import {createRapierNavSensor, type NavSensor} from '../ai/nav/sensor.ts'
import {createRapierLineOfSight, type LineOfSightChecker} from '../ai/line_of_sight.ts'
import {createRapierLosRayCaster, createRapierNavRayCaster} from './rapier_queries.ts'
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
import {categoryCollisionGroups, collisionCategoryOf} from '../../../physics/collision_category.ts'
import {CHARACTER_LINEAR_DAMPING, CHARACTER_SEPARATION_SPEED} from './constants.ts'
import type {GroundContactLike} from './ground_state.ts'
import {resolveGroundState} from './ground_state.ts'
import {computeSeparation, separationSlopeDy} from './separation.ts'
import type {CharacterSaveConfig} from '../../../save_load/types.ts'
import {getSkillExecutor, registerSkillExecutor} from '../../../character/combat/executor.ts'
import {attackDetectOBB, createMeleeExecutor, targetHitBoxHalves, testAttackDetect} from '../combat/melee_executor.ts'
import type {WorldDamageTarget, WorldDamageTargetProvider} from '../../../character/combat/world_targets.ts'
import {ROLL_WORLD_DAMAGE} from '../../../character/combat/constants.ts'
import {createRangedExecutor} from '../combat/ranged_executor.ts'
import {HITSTOP_DURATION, HITSTOP_TIMESCALE} from '../combat/constants.ts'
import {createMaterialEffects} from '../combat_vfx/material_effects.ts'
import {type AttackHitBoxes, createAttackHitBoxes, syncWeaponDebugBox} from '../combat_vfx/hitbox_debug.ts'
import {VISION_FAN_HALF_ANGLE, VISION_FAN_RAY_COUNT, VISION_FAN_RAY_STEP} from '../ai/constants.ts'
import type {EntityInfoSource, EntityPanelInfo} from '../../box/base/types/entity_info.ts'
import {createEmitter} from '../../box/base/types/event_emitter.ts'
import {cleanupWireframe, createWireframe} from '../../box/base/render'
import {createCharacterPanel} from '../ui/panel.ts'
import {phaseDurationOf, resolvePhases, FLINCH_DURATION, HEAVY_FLINCH_DURATION} from '../../../character/combat/attack_phases.ts'
import {isWeakFlinchReceptive} from '../../../character/combat/impact.ts'
import {rollSpinProgress} from '../../../character/combat/roll_skill.ts'

/** Rapier 带 body/bodyHandle 反查的超类型 */
type CharacterRigidBody = RAPIER.RigidBody

/** 刀光轨迹刀尖采样复用向量（避免每帧分配） */
const _trailTipVec = new Vector3()

/** 远程枪口世界朝向采样复用对象（武器骨骼世界四元数 × 本地 +Y，投影到水平面） */
const _muzzleQuat = new Quaternion()
const _muzzleVec = new Vector3()

/** 角色朝向提取复用对象（将旋转后的前向量投影到水平面求朝向，避免每帧分配） */
const _facingForward = new Vector3()
const _facingQuat = new Quaternion()
const _facingEuler = new Euler()

/** 死亡倒下合成复用对象（绕「上 × 倒向」轴旋转 dyingFallAngle 再叠加朝向，避免每帧分配） */
const _deathFallAxis = new Vector3()
const _deathFallQuat = new Quaternion()
const _deathYawQuat = new Quaternion()
const _upAxis = new Vector3(0, 1, 0)

/** 翻滚根旋转合成复用对象（朝向 × 本地前滚翻自转，并绕身体中心做位置补偿，避免每帧分配） */
const _rollAxis = new Vector3(1, 0, 0)
const _rollSpinQuat = new Quaternion()
const _rollYawQuat = new Quaternion()
const _rollPivot = new Vector3()
const _rollOffset = new Vector3()
const _shieldQuat = new Quaternion()

/** 根据 AttackConfig 解析武器运行时（武器预设 + 数值覆写；test_weapon 走测试专用链） */
const weaponRuntimeOf = (attack: AttackConfig, holdMode?: HoldMode): WeaponRuntime => {
    if (attack.weaponId === TEST_WEAPON_ID) return createTestWeaponRuntime(holdMode)
    return createWeaponRuntime(attack.weaponId, {
        damage: attack.damage,
        cooldown: attack.cooldown,
        charge: attack.charge,
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
    selfMesh?: Object3D,
    targetX?: number, targetY?: number, targetZ?: number,
): void => {
    const vp = hitBoxes.visionPositions
    /* 与索敌判定同源：castFan 扫描整个扇形，射线截断到最近遮挡点（无 checker 时直达侦测半径） */
    if (los) los.castFan(x, eyeY, z, yaw, len, _fanVizDists, selfMesh)
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
    setPlayerMove: (dx: number, dz: number, jump: boolean, forwardX: number, forwardZ: number, roll?: boolean) => void
    setPlayerAttack: (attackKey?: AttackKey, holdDuration?: number) => import('../../../character/combat/types.ts').AttackResult
    /**
     * 玩家按下攻击键：可蓄力的远程武器进入蓄力（按住期间冻结在蓄力锚点阶段并累积力度）；
     * 盾键（主手盾=轻/重击键、副手盾=重击键）改为记录按住时刻，长按阈值后举盾格挡。AI 不使用。
     */
    beginPlayerAttackHold: (attackKey?: AttackKey) => void
    /**
     * 玩家松开攻击键：盾键长按已举盾则仅落盾（不出招）、短按按该键出招（副手盾无攻击）；
     * 其余若处于蓄力中则结束蓄力（段继续推进并出手），否则按原有语义触发攻击。
     */
    endPlayerAttackHold: (attackKey: AttackKey, holdDuration: number) => void
    /**
     * 玩家取消攻击保持（拖拽旋转视角、失焦等）：盾键仅落盾；蓄力键清空按住状态并中止当前攻击段（不发射）。
     */
    cancelPlayerAttackHold: (attackKey: AttackKey) => void
    /** 玩家交互脉冲：本帧按下交互键且存在目标时传 true，并给出目标世界坐标（用于转身朝向） */
    setPlayerInteract: (pending: boolean, targetX: number, targetZ: number) => void
    getPlayerCharacter: () => CharacterEntity | undefined
    getHostileTo: (faction: number) => CharacterEntity[]
    getCharacterByBody: (body: CharacterRigidBody) => CharacterEntity | undefined
    update: (dt: number) => void
    /**
     * 移动平台携带：对「真实接触移动支撑」的角色按平台本帧位移/转动平移位姿。
     * **必须在 `world.step` 之前调用**（平台同级已瞬移到新位姿，乘客对齐后步进无穿透 → 无顶起抖动）。
     */
    applySupportCarry: (dt: number) => void
    setAIEnabled: (enabled: boolean) => void
    activateAI: () => void
    add: (config: CharacterSaveConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, opts?: {health?: number}) => {id: number}
    getAll: () => readonly CharacterEntity[]
    setTransform: (id: number, pos: {x: number; y: number; z: number}, rotDeg: {x: number; y: number; z: number}) => void
    updateCharacterConfig: (id: number, charCfg: Partial<CharacterConfig>, newAttackSlot?: AttackConfig, newFaction?: number, newMaxHealth?: number, newTendencyConfig?: TendencyConfig, newHealth?: number, newEquipment?: {baseDefense?: DefenseProfile; armor?: ArmorLoadout; limb?: LimbLoadout}, newOffhand?: AttackConfig | null) => void
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
    /**
     * 玩家持握模式环切：按当前可用模式列表（单持 → 双手共持 → 双持）取下一个；
     * 无玩家 / 无可用模式时不动作。返回切换后的模式（未动作 = undefined）。
     */
    cyclePlayerHoldMode: () => HoldMode | undefined
    /** 设置角色的额外锁定点（默认身体中心点不可配置；非法条目安全剔除） */
    setLockPoints: (id: number, points: readonly LockPointConfig[]) => void
    /** 配置 AI 感知（视线检查 + 导航传感器，需在所有实体系统初始化后调用） */
    setupAI: (systems: readonly EntityInfoSource[]) => void
    /** 设置单角色导航感知开关 */
    setNavEnabled: (id: number, enabled: boolean) => void
    /** 设置近战命中冲击监听器（参数为命中点世界坐标，null 清除） */
    setOnMeleeImpact: (listener: ((x: number, y: number, z: number) => void) | null) => void
    /** 注册世界受击目标提供者（可破坏场景道具），近战 / 远程 / 爆炸 / 翻滚命中路径据此结算 */
    registerWorldDamageTargets: (provider: WorldDamageTargetProvider) => void
    /** 清除执行期产生的全部子弹（子弹是战斗期临时对象、不进存档，世界还原/载入时必须显式清理） */
    clearBullets: () => void
}

export const setupCharacterEntities = (scene: Scene, shared: SharedWorld): CharacterEntitySystem => {
    const {world} = shared
    const characters: CharacterEntity[] = []
    const aiMap = new Map<number, AIContext>()
    const bodyCharMap = new Map<number, CharacterEntity>()
    /** 角色 id → 实体（战斗目标 / 瞄准目标查询 O(1)，避免逐帧对 characters 线性扫描） */
    const charById = new Map<number, CharacterEntity>()
    /** 角色碰撞 mesh → 物理刚体 handle（Rapier 射线查询排除自身 / 战斗目标用；每帧重建） */
    const meshBodyHandle = new Map<Object3D, number>()
    const aiTargetDirs = new Map<number, {dx: number; dz: number}>()
    const appearanceModels = new Map<number, CharacterModel>()
    const appearanceSystems = new Map<number, AppearanceSystem>()
    const weaponTrails = new Map<number, WeaponTrail>()
    const facingAngles = new Map<number, number>()
    /** 盾遮挡体：每持盾角色的无父刚体 parentless sensor 碰撞体 + 其当前 `ShieldBlockConfig`（配置引用变化时重建） */
    const shieldColliders = new Map<number, {collider: RAPIER.Collider; block: ShieldBlockConfig}>()
    /**
     * 盾碰撞体 handle → 持盾角色 id（供子弹形状扫描按阵营过滤归属）。
     * Rapier 的 handle 在碰撞体销毁后可能被复用，每次重建 / 销毁都同步维护。
     */
    const shieldOwnerByHandle = new Map<number, number>()
    /** 攻击判定箱调试线框（edit 模式随碰撞体可视化一同显示） */
    const attackHitBoxes = new Map<number, AttackHitBoxes>()
    let attackHitBoxVisible = false
    let nextId = 1
    let selectedId: number | undefined
    let aiEnabled = false

    /** 按当前主手 / 副手武器与持握模式同步外观装配（副手在双手共持时挂背，其余模式握在左手；主手为远程时不展示副手） */
    const syncWeaponAppearance = (entity: CharacterEntity): void => {
        const model = appearanceModels.get(entity.id)
        if (model === undefined) return
        model.equipWeapon({
            main: entity.combat.weapon.mesh,
            ...(entity.combat.weapon.type === 'melee'
                ? {offhand: entity.combat.offhand?.weapon.mesh, offhandStowed: entity.holdMode === 'two_handed'}
                : {}),
        })
    }

    /** 销毁角色盾遮挡体碰撞体（重建 / 卸盾 / 移除角色时调用） */
    const destroyShieldCollider = (id: number): void => {
        const state = shieldColliders.get(id)
        if (state === undefined) return
        shieldOwnerByHandle.delete(state.collider.handle)
        world.removeCollider(state.collider, false)
        shieldColliders.delete(id)
    }

    /**
     * 每帧同步盾遮挡体：持盾时懒创建 parentless sensor（membership 仅 `'shield'` 类别位、mask 0，不参与物理，
     * 仅供子弹形状扫描），按 body 位置 + 朝向 + `cover` 写 world 位姿；仅举盾且未破防时启用。
     *
     * 注意：本函数在 `world.step` 之后运行，移动碰撞体不刷新 Rapier 查询管线，故同帧子弹 `castShape`
     * 命中的盾位姿比角色晚一帧（≤ 1 帧位移）。当前由「命中半径内补扫」补偿，未观察到穿透；若后续
     * 高速弹在盾缘漏判，再评估在全部盾同步后补一次 `queryPipeline.update()`。
     */
    const syncShieldCollider = (entity: CharacterEntity): void => {
        const block = entity.combat.block
        if (block === undefined) {
            destroyShieldCollider(entity.id)
            return
        }
        let state = shieldColliders.get(entity.id)
        if (state === undefined || state.block !== block) {
            destroyShieldCollider(entity.id)
            const {cover} = block
            const desc = RAPIER.ColliderDesc.cuboid(cover.width / 2, cover.height / 2, cover.depth / 2)
                .setSensor(true)
                .setCollisionGroups(categoryCollisionGroups(0, 0, 'shield'))
            state = {collider: createColliderForBody(world, desc, undefined), block}
            shieldColliders.set(entity.id, state)
            shieldOwnerByHandle.set(state.collider.handle, entity.id)
        }
        const active = entity.combat.blocking && entity.combat.guard > 0 && !entity.combat.isDead
        state.collider.setEnabled(active)
        if (!active) return
        const scale = entity.config.scale
        const p = entity.body.translation()
        const yaw = facingAngles.get(entity.id) ?? 0
        /* `cover` 相对角色原点（脚底）：body 中心比原点高 originToCenterY，故减去还原到原点坐标 */
        const originY = p.y - originToCenterY(entity.config)
        const offsetZ = block.cover.offsetZ * scale
        const offsetY = block.cover.offsetY * scale
        state.collider.setTranslation({
            x: p.x + Math.sin(yaw) * offsetZ,
            y: originY + offsetY,
            z: p.z + Math.cos(yaw) * offsetZ,
        })
        _shieldQuat.setFromAxisAngle(_upAxis, yaw)
        state.collider.setRotation(_shieldQuat)
    }

    let playerAttackPending = false
    let playerDx = 0
    let playerDz = 0
    let playerJump = false
    let playerRoll = false
    let playerForwardX = 0
    let playerForwardZ = 1
    /** 玩家交互脉冲与目标坐标（帧末与攻击脉冲一同归零；目标坐标供 interacting 朝向使用） */
    let playerInteractPending = false
    let playerInteractTargetX = 0
    let playerInteractTargetZ = 0

    const events = createEmitter<{ delete: [id: number, wasSelected: boolean]; select: [id: number | undefined] }>()
    const panelInfos: EntityPanelInfo[] = []

    /** 活跃接触对（从碰撞事件总线维护），供地面检测 / AI 推挤 / 分离使用 */
    const contactTracker: ContactTracker = createContactTracker(shared.eventBus)

    /* 移动支撑携带的临时对象（逐角色顺序使用，避免帧内分配） */
    const _supportAxis = new Vector3()
    const _supportQuat = new Quaternion()
    const _supportVec = new Vector3()

    const getCharacterByBody = (body: CharacterRigidBody): CharacterEntity | undefined => bodyCharMap.get(body.handle)

    const getAllCharacters = (): readonly CharacterEntity[] => characters
    const getModel = (id: number): CharacterModel | undefined => appearanceModels.get(id)
    /** 命中顿帧计时器（真实时间递减，>0 时角色子系统 dt 缩放趋近冻结） */
    let hitstopTimer = 0
    /** 近战命中冲击监听器（相机震动等打击感系统注入） */
    let meleeImpactListener: ((x: number, y: number, z: number) => void) | null = null
    /** 世界受击目标提供者（可破坏场景道具等实体系统注入） */
    let worldDamageTargets: WorldDamageTargetProvider | null = null

    const setOnMeleeImpact = (listener: ((x: number, y: number, z: number) => void) | null): void => {
        meleeImpactListener = listener
    }

    const registerWorldDamageTargets = (provider: WorldDamageTargetProvider): void => {
        worldDamageTargets = provider
    }

    /** 翻滚命中可破坏世界目标：无敌帧窗口内按胶囊水平近接判定，按来源类别 roll 结算 */
    const applyRollWorldDamage = (entity: CharacterEntity, targets: readonly WorldDamageTarget[]): void => {
        const pos = entity.body.translation()
        const radius = (CHARACTER_BASE_SIZE.width / 2) * entity.config.scale + 0.25
        const halfHeight = (CHARACTER_BASE_SIZE.height / 2) * entity.config.scale
        for (const wt of targets) {
            if (wt.dead) continue
            if (Math.abs(wt.x - pos.x) > wt.hx + radius) continue
            if (Math.abs(wt.z - pos.z) > wt.hz + radius) continue
            if (wt.y + wt.hy < pos.y - halfHeight || wt.y - wt.hy > pos.y + halfHeight) continue
            let dx = wt.x - pos.x
            let dz = wt.z - pos.z
            const len = Math.hypot(dx, dz)
            if (len > 0.0001) { dx /= len; dz /= len } else { dx = 0; dz = 1 }
            wt.onAttacked('roll', 'physical', ROLL_WORLD_DAMAGE, dx, dz)
        }
    }

    const meleeExecutor = createMeleeExecutor(getAllCharacters, getModel, (id) => facingAngles.get(id) ?? 0, (x, y, z) => {
        hitstopTimer = HITSTOP_DURATION
        meleeImpactListener?.(x, y, z)
    }, () => worldDamageTargets?.() ?? [])
    const rangedExecutor = createRangedExecutor(shared, scene, () => worldDamageTargets?.() ?? [], (handle) => shieldOwnerByHandle.get(handle))
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
    /** 材质表面效果（受击闪红 + 翻滚无敌半透明白） */
    const materialEffects = new Map<number, ReturnType<typeof createMaterialEffects>>()
    const noopExecCtx: import('../../../character/combat/executor.ts').ExecutorContext = {
        fireProjectile: () => {},
    }

    /** 玩家攻击脉冲携带的攻击键组（帧末与脉冲一同归零） */
    let playerAttackKey: AttackKey | undefined = undefined
    /** 玩家攻击脉冲携带的按键按住时长（秒），帧末与脉冲一同归零 */
    let playerAttackHoldDuration = 0
    /** 玩家是否正按住可蓄力远程武器的攻击键（持续状态；按住期间冻结蓄力段并累积力度） */
    let playerAttackHeld = false
    /** 玩家当前按住且由盾接管的攻击键（主手盾=轻/重击键，副手盾=重击键）；undefined 表示无盾按住 */
    let playerShieldHoldKey: GroundAttackKey | undefined = undefined
    /** 盾按住已持续时长（秒）：达到 block.holdThreshold 后进入格挡 */
    let playerShieldHoldTime = 0

    /** 角色 FSM 状态 → 本地化键 */
    const CHARACTER_STATE_KEYS: Record<CharacterState, StringLocaleKey> = {
        idle: 'entity.state.idle',
        walking: 'entity.state.walking',
        jumping: 'entity.state.jumping',
        falling: 'entity.state.falling',
        attacking: 'entity.state.attacking',
        air_attacking: 'entity.state.air_attacking',
        dying: 'entity.state.dying',
        rolling: 'entity.state.rolling',
        flinching: 'entity.state.flinching',
        interacting: 'entity.state.interacting',
        knockdown: 'entity.state.knockdown',
        getting_up: 'entity.state.getting_up',
        blocking: 'entity.state.blocking',
        guard_broken: 'entity.state.guard_broken',
    }

    /** AI 战斗层状态 → 本地化键 */
    const COMBAT_STATE_KEYS: Record<CombatState, StringLocaleKey> = {
        chase: 'entity.ai.combat.chase',
        approach: 'entity.ai.combat.approach',
        volley: 'entity.ai.combat.volley',
        kite: 'entity.ai.combat.kite',
        attack: 'entity.ai.combat.attack',
        flee: 'entity.ai.combat.flee',
        inactive: 'entity.ai.combat.inactive',
    }

    /** AI 和平层状态 → 本地化键 */
    const PEACE_STATE_KEYS: Record<PeaceState, StringLocaleKey> = {
        patrol: 'entity.ai.peace.patrol',
        build: 'entity.ai.peace.build',
    }

    /** 列表行当前状态文本：角色 FSM 状态；AI 激活时追加 AI 双层 FSM（和平/战斗层:子状态）；死亡显示「已死亡」 */
    const stateLabelOf = (ch: CharacterEntity): string => {
        if (ch.combat.isDead) return translate('entity.state.dead')
        const state = translate(CHARACTER_STATE_KEYS[ch.stateMachine.currentState])
        const ai = aiMap.get(ch.id)
        if (ai === undefined) return state
        return ai.activeFsm === 'combat'
            ? `${state}|${translate('entity.ai.combat')}:${translate(COMBAT_STATE_KEYS[ai.combatState])}`
            : `${state}|${translate('entity.ai.peace')}:${translate(PEACE_STATE_KEYS[ai.peaceState])}`
    }

    /** 单条角色列表行文本（含本地化武器名 / 攻击类别短名；语言切换后由 element_list 按需重算） */
    const characterRowText = (ch: CharacterEntity): string => {
        const playerPrefix = ch.isPlayer ? translate('entity.player_prefix') : ''
        const weapon = ch.combat.weapon
        const weaponName = weaponDisplayName(weapon.id, weapon.name)
        const def = ch.combat.defense
        /* 有效移速 = 基础移速 × 装备移速乘数；保留两位小数避免浮点尾巴，整数不显示小数点 */
        const speed = Number(moveSpeedOf(ch).toFixed(2))
        return `${playerPrefix}#${ch.id}  HP:${ch.combat.health}/${ch.combat.maxHealth}  ${weaponName}(${weapon.damage})  def:${translate('entity.def_phys_short')}${def.physical}/${translate('entity.def_magic_short')}${def.magic}  spd:${speed}  [${stateLabelOf(ch)}]`
    }

    const refreshPlayerLabel = (): void => {
        const infoById = new Map(panelInfos.map(pi => [pi.id, pi]))
        for (const ch of characters) {
            const pi = infoById.get(ch.id)
            if (!pi) continue
            pi.rowText = characterRowText(ch)
            pi.rowTextOf = () => characterRowText(ch)
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
        offhandAttack: AttackConfig | undefined,
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
        /* 副手武器运行时（可选）：单持 / 双持时装备，双手共持时挂背；主手为远程时仅存数据不展示 */
        const offhandRuntime = offhandAttack !== undefined ? weaponRuntimeOf(offhandAttack) : undefined
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
        /* 主手为远程时不展示副手（副手仅服务近战三持握模组）；近战时副手挂左手（默认单持） */
        model.equipWeapon({
            main: runtime.weapon.mesh,
            ...(runtime.weapon.type === 'melee' ? {offhand: offhandRuntime?.weapon.mesh} : {}),
        })
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
            {
                ...(config.poiseMax !== undefined ? {poiseMax: config.poiseMax} : {}),
                ...(config.poiseRegenDelay !== undefined ? {poiseRegenDelay: config.poiseRegenDelay} : {}),
                ...(config.poiseRegenPerSec !== undefined ? {poiseRegenPerSec: config.poiseRegenPerSec} : {}),
                ...(config.knockdownDuration !== undefined ? {knockdownDuration: config.knockdownDuration} : {}),
                ...(config.getUpDuration !== undefined ? {getUpDuration: config.getUpDuration} : {}),
            },
        )
        setCombatOffhand(combat, offhandRuntime)

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
            groundBodyHandle: null,
            airborneTime: 0,
            groundedTime: 0,
            rowText: '',
            isPlayer: isPlayer ?? false,
            navEnabled,
            peaceStrategy,
            combatStrategy,
            isDying: false,
            dyingTimer: 0,
            dyingFallDirX: 0,
            dyingFallDirZ: 0,
            dyingFallAngle: 0,
            knockdownFallDirX: 0,
            knockdownFallDirZ: 0,
            knockdownFallAngle: 0,
            combat,
            holdMode: defaultHoldMode(runtime.weapon),
            lockPoints: [],
            interactTargetActive: false,
            interactTargetX: 0,
            interactTargetZ: 0,
            stateMachine,
        }

        bodyCharMap.set(body.handle, entity)
        charById.set(entity.id, entity)
        meshBodyHandle.set(entity.mesh, body.handle)
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

        const effects = createMaterialEffects(entity)
        materialEffects.set(entity.id, effects)
        entity.combat.onDamageTaken = (amount: number, event) => {
            effects.onDamage(amount)
            /* 记录冲击方向（死亡倒向依据）：伤害事件携带世界水平单位向量，仅在有效方向时覆盖旧值 */
            if (event.dirX !== undefined && event.dirZ !== undefined && (event.dirX !== 0 || event.dirZ !== 0)) {
                entity.combat.lastHitDirX = event.dirX
                entity.combat.lastHitDirZ = event.dirZ
            }
            const c = entity.combat
            /* 韧性结算：命中按削韧值扣除并重置回充延迟 */
            if (event.poiseDamage > 0) {
                c.poise = Math.max(0, c.poise - event.poiseDamage)
                c.poiseRegenDelayTimer = c.poiseRegenDelay
            }
            /* 冲击反应：倒地（韧性归零或 knockdown 级）> 强硬直（打断攻击）> 弱硬直（仅非承诺动作）> 轻（无效果） */
            if (c.health > 0) {
                if (event.impact === 'knockdown' || c.poise <= 0) {
                    c.pendingKnockdown = true
                } else if (event.impact === 'heavy') {
                    if (c.flinchImmunityTimer <= 0) {
                        c.flinchDuration = HEAVY_FLINCH_DURATION
                        c.pendingFlinch = true
                    }
                } else if (event.impact === 'medium' && c.flinchImmunityTimer <= 0
                    && isWeakFlinchReceptive(entity.stateMachine.currentState)) {
                    c.flinchDuration = FLINCH_DURATION
                    c.pendingFlinch = true
                }
            }
            /* 受击转战斗（仇恨）：被背后/视野外攻击或接敌冷却期内挨打时强制还击 */
            const aiCtx = aiMap.get(entity.id)
            if (aiCtx && entity.combat.health > 0) {
                notifyAIDamaged(aiCtx, entity, characters, event.sourceId)
            }
        }

        /* 行文本占位：紧接的 refreshPlayerLabel() 会写入本地化文本并提供按需重算的 rowTextOf */
        const badgeLabel = isPlayer ? 'P' : `F${faction}`
        panelInfos.push({id, type: 'character', badgeLabel, badgeColor: factionBadgeColor(faction, isPlayer ?? false), rowText: ''})
        refreshPlayerLabel()

        return entity
    }

    const spawnAt = (x: number, y: number, z: number): void => {
        const meleePreset: AttackConfig = {weaponId: 'long_sword'}
        const entity = spawnEntity(DEFAULT_CHARACTER_CONFIG, meleePreset, undefined, {tendencyId: 'hostileExceptSelf'}, 0, x, y, z)
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
            weapon.detectionRange, entity.mesh as Object3D)
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
        charById.delete(entity.id)
        meshBodyHandle.delete(entity.mesh)
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
        destroyShieldCollider(entity.id)

        characters.splice(idx, 1)
        aiMap.delete(id)
        aiTargetDirs.delete(id)
        materialEffects.delete(id)

        const pi = panelInfos.findIndex(p => p.id === id)
        if (pi !== -1) panelInfos.splice(pi, 1)

        if (id === selectedId) selectedId = undefined
    }

    const getMeshes = (): Mesh[] => characters.map(c => c.mesh)
    const getEntityList = (): Array<{id: number; mesh: Mesh}> => characters.map(c => ({id: c.id, mesh: c.mesh}))
    const getAll = (): readonly CharacterEntity[] => characters

    const setPlayerMove = (dx: number, dz: number, jump: boolean, forwardX: number, forwardZ: number, roll?: boolean): void => {
        playerDx = dx
        playerDz = dz
        playerJump = jump
        playerRoll = roll ?? false
        playerForwardX = forwardX
        playerForwardZ = forwardZ
    }

    const setPlayerAttack = (attackKey?: AttackKey, holdDuration?: number): AttackResult => {
        const player = getPlayerCharacter()
        if (!player || player.combat.isDead) return 'dead'
        /* 空中攻击态按下的攻击键统一映射到空中攻击键（无空中链的武器起手解析失败 → 拒绝） */
        const key: AttackKey = isAirborneAttackState(player.stateMachine.currentState) ? 'air' : (attackKey ?? 'light')
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

    /**
     * 盾接管按键：主手盾由轻 / 重击键控盾（长按=格挡、短按仍可盾击 / 盾撞）；
     * 副手盾仅重击键控盾（长按=格挡、短按不出招，副手盾无攻击能力）。
     */
    const shieldHoldKeysOf = (player: CharacterEntity): readonly GroundAttackKey[] => {
        const main = player.combat.weapon
        if (main !== undefined && main.type === 'melee' && main.block !== undefined) return ['light', 'heavy']
        const off = player.combat.offhand
        if (off !== undefined && off.weapon.type === 'melee' && off.weapon.block !== undefined) return ['heavy']
        return []
    }

    /** 玩家按下攻击键：可蓄力攻击（远程弓/投掷、近战重击）进入蓄力（按住期间冻结并累积力度）；盾键转入举盾计时 */
    const beginPlayerAttackHold = (attackKey?: AttackKey): void => {
        const player = getPlayerCharacter()
        if (!player || player.combat.isDead) return
        /* 空中攻击不可蓄力：空中攻击态忽略蓄力保持，松开后按空中攻击语义出招 */
        if (isAirborneAttackState(player.stateMachine.currentState)) return
        const key = attackKey ?? 'light'
        /* 盾键：记录按下时刻，长按超过阈值后进入格挡（不进蓄力） */
        if (key !== 'air' && shieldHoldKeysOf(player).includes(key)) {
            /* 已有盾键按住时忽略后续盾键（主手盾双键均可控盾），避免互相覆盖致松手误出招 */
            if (playerShieldHoldKey !== undefined) return
            playerShieldHoldKey = key
            playerShieldHoldTime = 0
            playerAttackHeld = false
            return
        }
        /* 该攻击键的起手段声明了 chargeFullTime 才进入蓄力；否则忽略（松开时按原有语义出招） */
        if (!isChargeableKey(player.combat.attacks, key)) return
        playerAttackHeld = true
        if (!player.combat.attackActive) {
            if (!canStartAttack(player.combat, {dx: playerDx, dz: playerDz, holdDuration: 0, attackKey: key})) {
                playerAttackHeld = false
                return
            }
            playerAttackPending = true
            playerAttackKey = key
            playerAttackHoldDuration = 0
        }
    }

    /** 玩家松开攻击键：盾键 → 长按已举盾则仅落盾（不出招），短按按该键出招；否则蓄力结束或按原有语义触发攻击 */
    const endPlayerAttackHold = (attackKey: AttackKey, holdDuration: number): void => {
        if (playerShieldHoldKey === attackKey) {
            const player = getPlayerCharacter()
            const wasBlocking = player?.combat.blocking === true
            playerShieldHoldKey = undefined
            playerShieldHoldTime = 0
            if (player === undefined) return
            player.combat.blockHeld = false
            /* 已进入格挡 → 松手仅落盾；未进入格挡（短按）→ 主手盾出招，副手盾无攻击 */
            if (!wasBlocking && shieldHoldKeysOf(player).includes(attackKey)
                && player.combat.weapon.type === 'melee' && player.combat.weapon.block !== undefined) {
                setPlayerAttack(attackKey, holdDuration)
            }
            return
        }
        /* 盾键但非当前按住键（主手盾双键并存时被忽略者）：松手不应触发攻击 */
        if (attackKey !== 'air') {
            const player = getPlayerCharacter()
            if (player !== undefined && shieldHoldKeysOf(player).includes(attackKey)) return
        }
        if (playerAttackHeld) {
            playerAttackHeld = false
            return
        }
        setPlayerAttack(attackKey, holdDuration)
    }

    /** 玩家取消攻击保持（按下后拖拽旋转视角、失焦等）：盾键仅落盾，蓄力键清空并中止当前攻击段 */
    const cancelPlayerAttackHold = (attackKey: AttackKey): void => {
        if (playerShieldHoldKey === attackKey) {
            const player = getPlayerCharacter()
            playerShieldHoldKey = undefined
            playerShieldHoldTime = 0
            if (player !== undefined) player.combat.blockHeld = false
            return
        }
        if (!playerAttackHeld) return
        playerAttackHeld = false
        const player = getPlayerCharacter()
        if (!player || !player.combat.attackActive) return
        const segment = player.combat.activeSegment
        if (segment === undefined) return
        /* 直接把段标记为「已播完」：下一次状态机更新即退出 attacking（不发射，不推进缓冲） */
        player.combat.phaseIndex = resolvePhases(segment.phases).length
        player.combat.attackTimer = segmentTotalDuration(segment)
        player.combat.attackHolding = false
        player.combat.bufferedSegment = undefined
    }

    const setPlayerInteract = (pending: boolean, targetX: number, targetZ: number): void => {
        playerInteractPending = pending
        if (pending) {
            playerInteractTargetX = targetX
            playerInteractTargetZ = targetZ
        }
    }

    const getPlayerCharacter = (): CharacterEntity | undefined =>
        characters.find(c => c.isPlayer && !c.combat.isDead)
    const getHostileTo = (faction: number): CharacterEntity[] =>
        characters.filter(c => c.combat.attackTendency(c.combat.faction, faction) && !c.combat.isDead)

    const setAIEnabled = (enabled: boolean): void => { aiEnabled = enabled }

    /* 地面检测排除角色接触：否则对方竖直胶囊的近水平侧面法线会成为 groundNormal，
     * 瞬态坡面投影把水平速度转成垂直速度（翻滚撞人时表现为「跳到对方头顶」），也会误判为着地而站在对方身上 */
    const buildGroundContacts = (entity: CharacterEntity): GroundContactLike[] =>
        queryColliderContacts(world, entity.mainCollider, contactTracker.pairsInvolving(entity.mainCollider.handle))
            .filter(c => collisionCategoryOf(c.otherCollisionGroups) !== 'character')

    /**
     * 移动支撑携带（**步进前的位置携带**）：对「本帧真实接触支撑某个移动平台」的角色，按平台本帧
     * 位移/转动平移其位姿。做法在物理步进**之前**调用——平台同级已瞬移到新位姿，乘客随之对齐，
     * 步进时二者无穿透 → 碰撞解算不产生额外冲量，故上升不抖、下降不落/地循环；跳跃/下落因无真实接触
     * 而自动不携带。这避免了「运动学推挤 + 速度叠加」在上升时的双倍顶起。
     */
    const applySupportCarry = (dt: number): void => {
        if (!(dt > 0)) return
        for (const entity of characters) {
            if (entity.combat.isDead) continue
            const handle = entity.groundBodyHandle
            if (handle === null || handle === undefined) continue
            const support = shared.movingSupports.get(handle)
            if (support === undefined) continue
            const {v, w} = support
            let px = 0
            let py = 0
            let pz = 0
            const rotating = w.x !== 0 || w.y !== 0 || w.z !== 0
            if (rotating) {
                const supportBody = world.getRigidBody(handle)
                if (supportBody) {
                    const c = supportBody.translation()
                    const p = entity.body.translation()
                    const wLen = Math.hypot(w.x, w.y, w.z)
                    const angle = wLen * dt
                    _supportAxis.set(w.x / wLen, w.y / wLen, w.z / wLen)
                    _supportQuat.setFromAxisAngle(_supportAxis, angle)
                    _supportVec.set(p.x - c.x, p.y - c.y, p.z - c.z).applyQuaternion(_supportQuat)
                    px = (c.x + _supportVec.x) - p.x
                    py = (c.y + _supportVec.y) - p.y
                    pz = (c.z + _supportVec.z) - p.z
                }
            }
            const dx = px + v.x * dt
            const dy = py + v.y * dt
            const dz = pz + v.z * dt
            if (dx === 0 && dy === 0 && dz === 0) continue
            const p = entity.body.translation()
            entity.body.setTranslation({x: p.x + dx, y: p.y + dy, z: p.z + dz}, true)
        }
    }

    const checkGround = (entity: CharacterEntity, dt: number): void => {
        const contacts = buildGroundContacts(entity)
        const next = resolveGroundState(contacts, entity.body.handle, {
            isOnGround: entity.isOnGround,
            groundNormal: entity.groundNormal,
            groundKeepTimer: entity.groundKeepTimer,
            groundBodyHandle: entity.groundBodyHandle,
        }, dt)
        entity.isOnGround = next.isOnGround
        entity.groundNormal = next.groundNormal
        entity.groundKeepTimer = next.groundKeepTimer
        entity.groundBodyHandle = next.groundBodyHandle
    }

    const update = (rawDt: number): void => {
        /* 命中顿帧：角色子系统（状态机/动画/执行器/AI）时间缩放，物理世界不受影响 */
        hitstopTimer = Math.max(0, hitstopTimer - rawDt)
        const dt = hitstopTimer > 0 ? rawDt * HITSTOP_TIMESCALE : rawDt

        /* 清理失效接触对（销毁的实体不会产生 stopped 事件） */
        contactTracker.prune(world)

        /* 重建「角色碰撞 mesh → 刚体 handle」映射，供 Rapier 视线 / 导航射线排除自身与战斗目标 */
        meshBodyHandle.clear()
        for (const entity of characters) meshBodyHandle.set(entity.mesh, entity.body.handle)

        for (const entity of characters) {
            if (entity.combat.isDead) continue

            /* 段冷却逐帧递减（只挡起手，链推进不查冷却） */
            tickSegmentCooldowns(entity.combat, dt)
            entity.combat.rollSkill.cooldownTimer = Math.max(0, entity.combat.rollSkill.cooldownTimer - dt)
            entity.combat.flinchImmunityTimer = Math.max(0, entity.combat.flinchImmunityTimer - dt)
            /* 无敌帧计时安全网：rolling 状态在窗口内每帧重算，退出状态已清零；此处递减兜底异常残留 */
            entity.combat.invincibleTimer = Math.max(0, entity.combat.invincibleTimer - dt)
            /* 倒地 / 起身无敌计时（knockdown / getting_up 状态逐帧写入，退出清零，此处递减兜底） */
            entity.combat.hitImmunityTimer = Math.max(0, entity.combat.hitImmunityTimer - dt)
            /* 韧性回充：受击延迟内暂停，延迟结束后按每秒回复量恢复至上限 */
            if (entity.combat.poiseRegenDelayTimer > 0) {
                entity.combat.poiseRegenDelayTimer = Math.max(0, entity.combat.poiseRegenDelayTimer - dt)
            } else if (entity.combat.poise < entity.combat.poiseMax) {
                entity.combat.poise = Math.min(entity.combat.poiseMax, entity.combat.poise + entity.combat.poiseRegenPerSec * dt)
            }
            /* 格挡槽回充：未举盾、未破防且未满时按每秒回复量恢复（举盾 / 破防期间暂停） */
            {
                const block = entity.combat.block
                if (block !== undefined
                    && !entity.combat.blocking
                    && entity.stateMachine.currentState !== 'guard_broken'
                    && entity.combat.guard < block.guardMax) {
                    entity.combat.guard = Math.min(block.guardMax, entity.combat.guard + block.guardRegenPerSec * dt)
                }
            }
            materialEffects.get(entity.id)?.tick(dt)
            checkGround(entity, dt)

            const aiCtx = aiMap.get(entity.id)
            if (aiCtx && aiEnabled) {
                /* 战斗中把当前攻击目标排除出导航感知：目标相对走位由战斗 FSM 负责，
                 * 否则贴脸前会被当成墙绕行（两个近战 AI 互相绕圈不打） */
                const combatTarget = aiCtx.activeFsm === 'combat' && aiCtx.combatTargetId !== undefined
                    ? charById.get(aiCtx.combatTargetId)
                    : undefined
                aiCtx.nav.ignoredMesh = combatTarget !== undefined && !combatTarget.combat.isDead ? combatTarget.mesh : null

                updateAI(dt, aiCtx, entity, characters, (dx, dz, attack, attackDX, attackDZ, block) => {
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

                    entity.stateMachine.setInput(finalDX, finalDZ, jump, attack, false, 'light', 0, false, false, block ?? false)
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
                /* 盾长按计时：按住盾键期间累计时长，供阈值判定举盾 */
                if (playerShieldHoldKey !== undefined) playerShieldHoldTime += dt
                /* 交互目标活跃：本帧按下交互键，或正处于 interacting（供转换守卫与转身朝向使用） */
                entity.interactTargetActive = playerInteractPending || entity.stateMachine.currentState === 'interacting'
                if (playerInteractPending) {
                    entity.interactTargetX = playerInteractTargetX
                    entity.interactTargetZ = playerInteractTargetZ
                }
                const block = entity.combat.block
                const playerBlockHeld = playerShieldHoldKey !== undefined
                    && block !== undefined
                    && entity.combat.guard > 0
                    && !entity.combat.isDead
                    && entity.stateMachine.currentState !== 'guard_broken'
                    && playerShieldHoldTime >= block.holdThreshold
                entity.stateMachine.setInput(playerDx, playerDz, playerJump, playerAttackPending, playerRoll, playerAttackKey, playerAttackHoldDuration, playerAttackHeld, playerInteractPending, playerBlockHeld)
                /* 攻击期间（含待起手帧）瞄准方向持续取相机前方：角色随之转向瞄准方向，
                 * 射击弹道再由武器实际朝向（muzzleDir）决定，避免背身射向目标 */
                if (playerAttackPending || entity.combat.attackActive) {
                    entity.combat.attackDirX = playerForwardX
                    entity.combat.attackDirZ = playerForwardZ
                }
            }

            entity.stateMachine.update(dt, entity)
            /* 翻滚无敌帧窗口内命中可破坏世界目标（按来源 roll 结算） */
            if (entity.isPlayer && entity.stateMachine.currentState === 'rolling'
                && entity.combat.invincibleTimer > 0 && worldDamageTargets !== null) {
                applyRollWorldDamage(entity, worldDamageTargets())
            }
            /* 翻滚无敌帧视觉：材质统一效果层切换为半透明白（与受击闪红共用快照/还原） */
            materialEffects.get(entity.id)?.setInvincible(entity.combat.invincibleTimer > 0)

            const model = appearanceModels.get(entity.id)
            const sys = appearanceSystems.get(entity.id)
            if (model && sys) {
                const linvel = entity.body.linvel()
                const hSpeed = Math.hypot(linvel.x, linvel.z)
                /* 计算阶段动画上下文（仅 attacking 状态注入当前段信息） */
                const activeSegment = entity.combat.activeSegment
                const inAttacking = (entity.stateMachine.currentState === 'attacking' || entity.stateMachine.currentState === 'air_attacking') && activeSegment !== undefined
                const phases = inAttacking ? resolvePhases(activeSegment.phases) : []
                const phaseDuration = inAttacking && entity.combat.phaseIndex < phases.length
                    ? phaseDurationOf(phases[entity.combat.phaseIndex], activeSegment.duration, activeSegment.recovery)
                    : 1
                const totalDuration = activeSegment !== undefined ? activeSegment.duration + activeSegment.recovery : 1
                const ctxPhaseName = inAttacking && entity.combat.phaseIndex < phases.length
                    ? phases[entity.combat.phaseIndex].name
                    : undefined

                /* 持盾手：格挡姿态据此决定抬臂；主手盾优先（与 `updateShieldBlock` 的盾来源一致） */
                const mainWeapon = entity.combat.weapon
                const shieldHand: 'main' | 'off' | undefined = entity.combat.block === undefined
                    ? undefined
                    : mainWeapon.type === 'melee' && mainWeapon.block !== undefined ? 'main' : 'off'

                sys.update(dt, model, entity.stateMachine.currentState, {
                    stateTime: entity.stateMachine.stateTime,
                    horizontalSpeed: hSpeed,
                    holdMode: entity.holdMode,
                    handedness: entity.config.handedness ?? DEFAULT_HANDEDNESS,
                    attackSegment: inAttacking ? activeSegment : undefined,
                    attackPhase: ctxPhaseName,
                    attackPhaseProgress: phaseDuration > 0 ? entity.combat.phaseTimer / phaseDuration : 0,
                    attackTotalProgress: inAttacking && totalDuration > 0 ? entity.combat.attackTimer / totalDuration : 0,
                    attackPhaseIndex: entity.combat.phaseIndex,
                    attackCharge: entity.combat.attackCharge,
                    attackHolding: entity.combat.attackHolding,
                    weaponHeld: model.weaponMesh !== null,
                    shieldHand,
                })

                const vx = entity.body.linvel().x
                const vz = entity.body.linvel().z
                const currentAngle = facingAngles.get(entity.id) ?? 0
                const isRolling = entity.stateMachine.currentState === 'rolling'
                const isKnockdown = entity.stateMachine.currentState === 'knockdown'
                const isGettingUp = entity.stateMachine.currentState === 'getting_up'

                let targetAngle: number
                /** 远程武器（近战不受瞄准朝向影响，攻击判定箱随武器模型） */
                const rangedWeapon = entity.combat.weapon.type === 'ranged'
                /** 当前战斗目标 id（仅 AI 处于 combat 时有效） */
                const aiCombatTargetId = aiCtx !== undefined && aiCtx.activeFsm === 'combat'
                    ? aiCtx.combatTargetId
                    : undefined
                const aiCombatTarget = !entity.isPlayer && !entity.isDying && rangedWeapon && aiCombatTargetId !== undefined
                    ? charById.get(aiCombatTargetId)
                    : undefined
                const aiAimTarget = aiCombatTarget !== undefined && !aiCombatTarget.combat.isDead ? aiCombatTarget : undefined
                /** 仅在「站定转身瞄准 / 射击动作」期间把朝向锁到目标；移动阶段（含逃跑/回撤）朝向跟随移动方向 */
                const aiFacingTarget = aiAimTarget !== undefined
                    && (entity.combat.attackActive || (aiCtx !== undefined && aiCtx.combatAimActive))
                if (entity.isPlayer) {
                    const inputLen = Math.hypot(playerDx, playerDz)
                    if (isRolling) {
                        /* 翻滚期间朝向锁定翻滚方向：输入转向不改变朝向，避免边滚边原地打转 */
                        targetAngle = Math.atan2(entity.combat.rollSkill.dirX, entity.combat.rollSkill.dirZ)
                    } else if (entity.stateMachine.currentState === 'interacting' && entity.interactTargetActive) {
                        /* 交互期间朝向锁定交互目标 */
                        const myPos = entity.body.translation()
                        const tdx = (entity.interactTargetX ?? myPos.x) - myPos.x
                        const tdz = (entity.interactTargetZ ?? myPos.z) - myPos.z
                        targetAngle = Math.hypot(tdx, tdz) > VELOCITY_DIR_THRESHOLD
                            ? Math.atan2(tdx, tdz)
                            : currentAngle
                    } else if (rangedWeapon && inAttacking) {
                        /* 玩家远程攻击：转向瞄准方向（相机前方），draw/aim 阶段完成转向后武器才对准目标 */
                        const aimLen = Math.hypot(entity.combat.attackDirX, entity.combat.attackDirZ)
                        targetAngle = aimLen > VELOCITY_DIR_THRESHOLD
                            ? Math.atan2(entity.combat.attackDirX, entity.combat.attackDirZ)
                            : currentAngle
                    } else if (inputLen > VELOCITY_DIR_THRESHOLD) {
                        targetAngle = Math.atan2(playerDx, playerDz)
                    } else {
                        targetAngle = currentAngle
                    }
                } else if (aiFacingTarget) {
                    /* 转向/瞄准流程：站定瞄准或射击动作期间持续对准目标 */
                    const myPos = entity.body.translation()
                    const tp = aiAimTarget.body.translation()
                    const tdx = tp.x - myPos.x
                    const tdz = tp.z - myPos.z
                    targetAngle = Math.hypot(tdx, tdz) > VELOCITY_DIR_THRESHOLD
                        ? Math.atan2(tdx, tdz)
                        : currentAngle
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
                } else if (isKnockdown || isGettingUp) {
                    /* 倒地 / 起身：绕世界轴「上 × 倒向」旋转 knockdownFallAngle（0 → π/2 倒地，π/2 → 0 起身），
                     * 再叠加保持的最后朝向；方向 / 角度由 knockdown / getting_up state 推进，与死亡倒地同机制 */
                    _deathFallAxis.set(entity.knockdownFallDirZ, 0, -entity.knockdownFallDirX)
                    if (_deathFallAxis.lengthSq() > 1e-8) {
                        _deathFallAxis.normalize()
                        _deathFallQuat.setFromAxisAngle(_deathFallAxis, entity.knockdownFallAngle)
                        _deathYawQuat.setFromAxisAngle(_upAxis, newAngle)
                        model.group.quaternion.copy(_deathFallQuat).multiply(_deathYawQuat)
                    } else {
                        model.group.rotation.set(0, newAngle, 0)
                    }
                } else if (isRolling) {
                    /* 翻滚前滚翻：clip 只含蜷缩姿态，根自转由状态驻留时间推导（同死亡倒地由 world 合成）；
                     * 根原点在脚底，绕身体中心自转需位置补偿 `center − Q·center`，否则会绕脚底划大圈 */
                    _rollSpinQuat.setFromAxisAngle(_rollAxis, Math.PI * 2 * rollSpinProgress(
                        entity.stateMachine.stateTime,
                        entity.combat.rollSkill.config.duration,
                    ))
                    _rollYawQuat.setFromAxisAngle(_upAxis, newAngle)
                    model.group.quaternion.copy(_rollYawQuat).multiply(_rollSpinQuat)
                    _rollPivot.set(0, originToCenterY(entity.config), 0)
                    _rollOffset.copy(_rollPivot).applyQuaternion(model.group.quaternion)
                    model.group.position.add(_rollPivot).sub(_rollOffset)
                } else {
                    /* 运行时朝向仅绕 Y（清除编辑态可能残留的 X/Z 视觉倾斜） */
                    model.group.rotation.set(0, newAngle, 0)
                }
                /* 碰撞箱可视化同步跟随身体朝向 */
                entity.mesh.rotation.set(0, newAngle, 0)

                /* 远程枪口世界朝向：武器本地 +Y = 枪口/弹道方向；在骨骼姿势与身体朝向写入后采样，
                 * 供 ranged_executor 在 release 帧作为弹道初始方向（角色朝向 + 出手动画共同决定） */
                if (rangedWeapon && !entity.isDying && model.weaponGroup !== null) {
                    model.weaponGroup.updateWorldMatrix(true, false)
                    model.weaponGroup.getWorldQuaternion(_muzzleQuat)
                    _muzzleVec.set(0, 1, 0).applyQuaternion(_muzzleQuat)
                    const muzzleLen = Math.hypot(_muzzleVec.x, _muzzleVec.z)
                    if (muzzleLen > 0.001) {
                        entity.combat.muzzleDirX = _muzzleVec.x / muzzleLen
                        entity.combat.muzzleDirZ = _muzzleVec.z / muzzleLen
                    }
                }

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
                            const target = charById.get(aiCtx.combatTargetId)
                            if (target && !target.combat.isDead) {
                                const tp = target.body.translation()
                                tx = tp.x
                                ty = tp.y + CHARACTER_BASE_SIZE.height * target.config.scale * 0.4
                                tz = tp.z
                            }
                        }
                        placeVisionFan(hitBoxes, losChecker, bPos.x, eyeY, bPos.z, yaw, fanLen, entity.mesh as Object3D, tx, ty, tz)
                        hitBoxes.visionFan.visible = true
                    } else {
                        hitBoxes.visionFan.visible = false
                    }
                }
            }

            /* 盾遮挡体同步：须在攻击 / 弹丸执行器之前（同帧子弹形状扫描据此命中盾） */
            syncShieldCollider(entity)

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
        playerRoll = false
        playerInteractPending = false

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

    const setupAI = (_systems: readonly EntityInfoSource[]): void => {
        /* 视线 / 导航统一走 Rapier 碰撞体 BVH 射线查询：地形 / 建筑 trimesh 三角形再多也不拖慢
         * （旧实现用 three Raycaster 全量扫渲染 mesh，大网格场景会卡死）。
         * mesh → 刚体 handle 解析用于在查询中排除发射者自身 / 战斗目标。 */
        const resolveBody = (mesh: Object3D | null): number | undefined =>
            mesh === null ? undefined : meshBodyHandle.get(mesh)

        losChecker = createRapierLineOfSight(createRapierLosRayCaster(shared, resolveBody))
        for (const ctx of aiMap.values()) {
            ctx.losChecker = losChecker
        }

        navSensor = createRapierNavSensor(createRapierNavRayCaster(shared, resolveBody))
        for (const ctx of aiMap.values()) {
            ctx.navSensor = navSensor
        }
    }

    const add = (saveConfig: CharacterSaveConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, opts?: {health?: number}): {id: number} => {
        const cfg: CharacterConfig = {
            speed: saveConfig.speed,
            jumpHeight: saveConfig.jumpHeight,
            scale: saveConfig.scale,
            /* 惯用手：非法 / 缺省安全回退 undefined（运行时按右撇子处理） */
            ...(isHandedness(saveConfig.handedness) ? {handedness: saveConfig.handedness} : {}),
            /* 韧性 / 倒地属性：旧档缺字段回退默认（createCombatComponent 内 clamp 默认值） */
            ...(saveConfig.poiseMax !== undefined ? {poiseMax: saveConfig.poiseMax} : {}),
            ...(saveConfig.poiseRegenDelay !== undefined ? {poiseRegenDelay: saveConfig.poiseRegenDelay} : {}),
            ...(saveConfig.poiseRegenPerSec !== undefined ? {poiseRegenPerSec: saveConfig.poiseRegenPerSec} : {}),
            ...(saveConfig.knockdownDuration !== undefined ? {knockdownDuration: saveConfig.knockdownDuration} : {}),
            ...(saveConfig.getUpDuration !== undefined ? {getUpDuration: saveConfig.getUpDuration} : {}),
        }
        /* 副手：未知武器 id 安全丢弃（回退无副手），避免未知 id 被静默替换成默认武器带入存档 */
        const offhandAttack = saveConfig.offhand !== undefined && isKnownWeaponId(saveConfig.offhand.weaponId)
            ? saveConfig.offhand
            : undefined
        const entity = spawnEntity(cfg, saveConfig.attack, offhandAttack, saveConfig.tendency, saveConfig.faction, x, y, z, saveConfig.isPlayer, saveConfig.peaceStrategy ?? 'patrol', saveConfig.combatStrategy ?? 'tactical', saveConfig.navEnabled ?? true)
        /* 持握模式：存档支持时应用，武器不支持时 setHoldMode 回退默认模式（不抛错） */
        if (saveConfig.holdMode !== undefined) setHoldMode(entity.id, saveConfig.holdMode)
        /* 防御 / 护甲 / 肢体：旧档缺字段回退零防御空装备；未知 id 由 resolve*Loadout 安全剔除 */
        setCombatEquipment(entity.combat, saveConfig.defense ?? ZERO_PROFILE, saveConfig.armor ?? {}, saveConfig.limb ?? {})
        /* 载入即回满韧性（poiseMax 已含装备汇总） */
        entity.combat.poise = entity.combat.poiseMax
        /* 额外锁定点：旧档缺字段回退仅默认身体中心点；非法条目由 sanitizeLockPoints 安全剔除 */
        entity.lockPoints = sanitizeLockPoints(saveConfig.lockPoints)
        const model = appearanceModels.get(entity.id)
        if (model) {
            model.equipArmor(resolveArmorLoadout(entity.combat.armor))
            model.equipLimbs(resolveLimbLoadout(entity.combat.limb))
        }
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
     * 切换持握模式：模式在武器声明范围内、且双持时副手为同类近战武器才接受；否则回退默认模式并返回 false。
     * 切换后按新模式重解析攻击链、清空段冷却 / 当前段，并同步外观（副手在双手共持时挂背、其余模式回手）。
     */
    const setHoldMode = (id: number, holdMode: HoldMode): boolean => {
        const entity = characters.find(c => c.id === id)
        if (entity === undefined) return false
        const supported = availableHoldModes(entity.combat.weapon, entity.combat.offhand?.weapon).includes(holdMode)
        const mode = supported ? holdMode : defaultHoldMode(entity.combat.weapon)
        if (entity.holdMode !== mode) {
            setCombatWeapon(entity.combat, runtimeForHoldMode(entity.combat.weapon, mode))
            entity.holdMode = mode
            entity.combat.activeSegment = undefined
            entity.combat.bufferedSegment = undefined
            entity.combat.segmentCooldowns.clear()
            syncWeaponAppearance(entity)
        }
        return supported
    }

    /** 玩家持握模式环切（单持 → 双手共持 → 双持 → 单持；可用列表按武器声明 + 副手同类过滤） */
    const cyclePlayerHoldMode = (): HoldMode | undefined => {
        const entity = characters.find(c => c.isPlayer)
        if (entity === undefined) return undefined
        const modes = availableHoldModes(entity.combat.weapon, entity.combat.offhand?.weapon)
        if (modes.length === 0) return undefined
        const index = modes.indexOf(entity.holdMode)
        const next = modes[(index + 1) % modes.length] ?? modes[0]
        setHoldMode(entity.id, next)
        return entity.holdMode
    }

    /** 设置额外锁定点：非法条目安全剔除（不抛错），默认身体中心点不受影响 */
    const setLockPoints = (id: number, points: readonly LockPointConfig[]): void => {
        const entity = characters.find(c => c.id === id)
        if (entity === undefined) return
        entity.lockPoints = sanitizeLockPoints(points)
    }

    const updateCharacterConfig = (id: number, charCfg: Partial<CharacterConfig>, newAttackSlot?: AttackConfig, newFaction?: number, newMaxHealth?: number, newTendencyConfig?: TendencyConfig, newHealth?: number, newEquipment?: {baseDefense?: DefenseProfile; armor?: ArmorLoadout; limb?: LimbLoadout}, newOffhand?: AttackConfig | null): void => {
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
        if (charCfg.handedness !== undefined) {
            /* 惯用手切换：主 / 副手槽位与网格镜像迁移（武器网格不重建）；动作镜像由 clip 层随 ctx 生效 */
            entity.config.handedness = charCfg.handedness
            appearanceModels.get(entity.id)?.setHandedness(charCfg.handedness)
        }
        if (newAttackSlot || newOffhand !== undefined) {
            if (newAttackSlot) {
                /* 换装：整体替换武器运行时（武器 + 攻击链 + 数值覆写） */
                setCombatWeapon(entity.combat, weaponRuntimeOf(newAttackSlot))
            }
            if (newOffhand !== undefined) {
                /* 副手变更：null = 卸下；undefined = 保持原副手 */
                setCombatOffhand(entity.combat, newOffhand === null ? undefined : weaponRuntimeOf(newOffhand))
            }
            /* 持握模式重置为该武器支持的首个模式（面板随后可再显式 setHoldMode），清空段冷却与当前段 */
            entity.holdMode = defaultHoldMode(entity.combat.weapon)
            entity.combat.activeSegment = undefined
            entity.combat.bufferedSegment = undefined
            entity.combat.segmentCooldowns.clear()
            syncWeaponAppearance(entity)
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
        /* 韧性属性：基础上界变更须重算「护甲 / 肢体 poise 汇总」，其余参数直接写入战斗组件 */
        if (charCfg.poiseMax !== undefined) {
            entity.config.poiseMax = charCfg.poiseMax
            entity.combat.basePoiseMax = charCfg.poiseMax
            setCombatEquipment(entity.combat, entity.combat.baseDefense, entity.combat.armor)
        }
        if (charCfg.poiseRegenDelay !== undefined) {
            entity.config.poiseRegenDelay = charCfg.poiseRegenDelay
            entity.combat.poiseRegenDelay = charCfg.poiseRegenDelay
        }
        if (charCfg.poiseRegenPerSec !== undefined) {
            entity.config.poiseRegenPerSec = charCfg.poiseRegenPerSec
            entity.combat.poiseRegenPerSec = charCfg.poiseRegenPerSec
        }
        if (charCfg.knockdownDuration !== undefined) {
            entity.config.knockdownDuration = charCfg.knockdownDuration
            entity.combat.knockdownDuration = charCfg.knockdownDuration
        }
        if (charCfg.getUpDuration !== undefined) {
            entity.config.getUpDuration = charCfg.getUpDuration
            entity.combat.getUpDuration = charCfg.getUpDuration
        }
        if (newTendencyConfig) {
            entity.combat.attackTendency = resolveTendency(newTendencyConfig)
            entity.combat.tendencyConfig = newTendencyConfig
        }
        if (newEquipment) {
            /* 基础防御 / 护甲 / 肢体变更：重算防御、攻击加成与移速并同步外观（未传项保持原值） */
            setCombatEquipment(
                entity.combat,
                newEquipment.baseDefense ?? entity.combat.baseDefense,
                newEquipment.armor ?? entity.combat.armor,
                newEquipment.limb,
            )
            const model = appearanceModels.get(entity.id)
            if (model) {
                if (newEquipment.armor !== undefined) model.equipArmor(resolveArmorLoadout(entity.combat.armor))
                if (newEquipment.limb !== undefined) model.equipLimbs(resolveLimbLoadout(entity.combat.limb))
            }
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
        beginPlayerAttackHold,
        endPlayerAttackHold,
        cancelPlayerAttackHold,
        setPlayerInteract,
        getPlayerCharacter,
        getHostileTo,
        getCharacterByBody,
        update,
        applySupportCarry,
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
        cyclePlayerHoldMode,
        setLockPoints,
        setupAI,
        setNavEnabled,
        setOnMeleeImpact,
        registerWorldDamageTargets,
        clearBullets,
    }

    return {
        ...ctxWithoutPanel,
        panel: createCharacterPanel(ctxWithoutPanel),
    }
}
