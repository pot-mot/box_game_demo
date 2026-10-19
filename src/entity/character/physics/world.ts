import {Euler, type LineBasicMaterial, type Mesh, Matrix4, type Object3D, Quaternion, type Scene, Vector3} from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type {SharedWorld} from '../../../physics/world.ts'
import {createColliderForBody, setBodyMass} from '../../../physics/rapier_utils.ts'
import {applyRenderPose, captureObjectRenderPose, resetObjectRenderPose} from '../../../physics/render_interpolation.ts'
import {createBodyEnvironment, resetBodyEnvironment} from '../../../physics/environment.ts'
import {worldizeHurtBlock, zeroWorldHurtBlock, type WorldHurtBlock} from '../../../character/hurt_blocks.ts'
import {bodyFormOf, isKnownBodyFormId, HUMANOID_BODY_FORM, weaponSelectableFor, type ColliderSpec} from '../body_form/index.ts'
import {obbFromTransform, type OBB} from '../combat/obb.ts'
import {type ContactTracker, createContactTracker, queryColliderContacts} from '../../../physics/contact_tracking.ts'
import type {CharacterConfig, CharacterEntity} from '../../../character/types.ts'
import {moveSpeedOf} from '../../../character/types.ts'
import type {AttackConfig} from '../../../character/archetypes.ts'
import type {TendencyConfig} from '../../../character/faction.ts'
import {resolveTendency} from '../../../character/faction.ts'
import type {AttackResult} from '../../../character/combat/types.ts'
import {createCombatComponent, setCombatEquipment, setCombatOffhand, setCombatWeapon, updateShieldBlock} from '../../../character/combat/types.ts'
import {ZERO_PROFILE, type DefenseProfile} from '../../../character/combat/defense.ts'
import type {DamageTypeProfile} from '../../../character/combat/damage_type.ts'
import type {ArmorLoadout, LimbLoadout} from '../../../character/armor/types.ts'
import {filterEquipLoadouts} from '../body_form/equip.ts'
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
import type {CombatSubStrategy, PeaceSubStrategy, OriginSubStrategy} from '../../../character/ai_strategy/types.ts'
import type {PeaceConfig} from '../../../character/ai_strategy/peace.ts'
import {DEFAULT_PEACE_CONFIGS} from '../../../character/ai_strategy/peace.ts'
import {DEFAULT_COMBAT_CONFIGS} from '../../../character/ai_strategy/combat.ts'
import {DEFAULT_ORIGIN_CONFIGS, DEFAULT_ROAMER_INTERVAL} from '../../../character/ai_strategy/origin.ts'
import {createRapierNavSensor, type NavSensor} from '../ai/nav/sensor.ts'
import {createRapierLineOfSight, type LineOfSightChecker} from '../ai/line_of_sight.ts'
import {createRapierLosRayCaster, createRapierNavRayCaster} from './rapier_queries.ts'
import {createAIMachine, notifyAIDamaged, updateAI} from '../ai/machine.ts'
import {notifyAIKill, setOriginFromCharacter} from '../ai/origin.ts'
import {DEFAULT_AI_BLOCK_COOLDOWN, DEFAULT_AI_BLOCK_DURATION, DEFAULT_CHASE_LEASH_RADIUS} from '../ai/constants.ts'
import {processNav} from '../ai/nav/machine.ts'
import {createCharacterMesh, updateCharacterMesh} from '../render'
import {COLLIDER_MESH_OPACITY} from '../render/constants.ts'
import type {AppearanceSystem} from '../appearance/system.ts'

import {createWeaponTrail, type WeaponTrail} from '../appearance/weapon_trail.ts'
import type {CreatureModel} from '../appearance/types.ts'
import type {BoneEventRecord} from '../../../skeleton/anim/types.ts'
import {ROTATION_SPEED, SELECT_PALETTE, VELOCITY_DIR_THRESHOLD} from '../appearance/constants.ts'
import {DEFAULT_CHARACTER_CONFIG} from '../validation.ts'
import {CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK} from '../constants.ts'
import {formBodyRadius, formEyeHeight} from '../body_form/geometry.ts'
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
import {type AttackHitBoxes, createAttackHitBoxes, syncWeaponDebugBox, syncHurtDebugBox} from '../combat_vfx/hitbox_debug.ts'
import {VISION_FAN_HALF_ANGLE, VISION_FAN_RAY_COUNT, VISION_FAN_RAY_STEP} from '../ai/constants.ts'
import type {EntityInfoSource, EntityPanelInfo} from '../../box/base/types/entity_info.ts'
import {createEmitter} from '../../box/base/types/event_emitter.ts'
import {cleanupWireframe, createWireframe} from '../../box/base/render'
import {createCharacterPanel} from '../ui/panel.ts'
import {phaseDurationOf, resolvePhases, FLINCH_DURATION, HEAVY_FLINCH_DURATION} from '../../../character/combat/attack_phases.ts'
import {inRecoveryWindow} from '../../../character/combat/attack_runtime.ts'
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

/** 游泳俯卧前倾角（绕本地 X 轴，face-down；60–75°）与合成复用对象 */
const SWIM_PRONE_PITCH = Math.PI * 0.38
const _swimPitchQuat = new Quaternion()

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

/** 角色实体原点（脚底）到物理刚体中心（碰撞体中心）的 Y 向偏移（由体形计划提供） */
const originToCenterY = (config: CharacterConfig): number =>
    bodyFormOf(config.bodyFormId).centerOffsetY * config.scale

/** 按体形碰撞 spec 生成 Rapier 碰撞体描述（尺寸随 scale 缩放；密度 0、类别 character） */
const makeColliderDescForSpec = (spec: ColliderSpec, scale: number): RAPIER.ColliderDesc => {
    const base = spec.kind === 'capsule'
        ? RAPIER.ColliderDesc.capsule(spec.halfHeight * scale, spec.radius * scale)
        : RAPIER.ColliderDesc.cuboid(spec.half.x * scale, spec.half.y * scale, spec.half.z * scale)
    return base
        .setTranslation(0, spec.offsetY * scale, 0)
        .setFriction(0)
        /* 密度 0：质量完全由附加质量决定，与碰撞体尺寸（scale）解耦 */
        .setDensity(0)
        .setCollisionGroups(categoryCollisionGroups(CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK, 'character'))
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
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
    setPlayerMove: (dx: number, dz: number, jump: boolean, forwardX: number, forwardZ: number, roll?: boolean, swimLift?: number) => void
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
    /** 玩家渲染插值位置（身体中心）：相机 / HUD 使用，避免直接读物理原始位置 */
    getPlayerRenderPosition: () => {readonly x: number; readonly y: number; readonly z: number} | undefined
    /** 物理步：把真实物理位置写到渲染根（碰撞体同步前调用） */
    syncTrueTransforms: () => void
    /** 每个物理步末记录渲染插值状态 */
    captureRenderState: () => void
    /** 传送 / 体形重建后重置插值历史（避免从旧位置插值滑行） */
    resetRenderState: (id: number) => void
    /** 每物理步的游戏逻辑（状态机 / 动画 / 计时器），供展示模式固定步子步调用 */
    fixedUpdate: (dt: number) => void
    getHostileTo: (faction: number) => CharacterEntity[]
    getCharacterByBody: (body: CharacterRigidBody) => CharacterEntity | undefined
    update: (dt: number) => void
    /**
     * 移动平台携带：对「真实接触移动支撑」的角色按平台本帧位移/转动平移位姿。
     * **必须在 `world.step` 之前调用**（平台同级已瞬移到新位姿，乘客对齐后步进无穿透 → 无顶起抖动）。
     */
    applySupportCarry: (dt: number) => void
    /** 每帧在 area 场写入前清零全部角色的环境场（供 area 通道使用） */
    clearEnvironments: () => void
    setAIEnabled: (enabled: boolean) => void
    activateAI: () => void
    add: (config: CharacterSaveConfig, x: number, y: number, z: number, quat?: {x: number; y: number; z: number; w: number}, opts?: {health?: number}) => {id: number}
    getAll: () => readonly CharacterEntity[]
    setTransform: (id: number, pos: {x: number; y: number; z: number}, rotDeg: {x: number; y: number; z: number}) => void
    updateCharacterConfig: (id: number, charCfg: Partial<CharacterConfig>, newAttackSlot?: AttackConfig, newFaction?: number, newMaxHealth?: number, newTendencyConfig?: TendencyConfig, newHealth?: number, newEquipment?: {baseDefense?: DefenseProfile; baseAttack?: DamageTypeProfile; armor?: ArmorLoadout; limb?: LimbLoadout}, newOffhand?: AttackConfig | null) => void
    /** 运行时切换体形（基础模组）；未知 id 或同体形返回 false */
    setBodyForm: (id: number, planId: string) => boolean
    /** 设置单个角色的和平策略 */
    setPeaceStrategy: (id: number, strategy: PeaceSubStrategy) => void
    /** 设置单个角色的和平策略配置 */
    setPeaceConfig: (id: number, config: PeaceConfig) => void
    /** 设置单个角色的战斗策略 */
    setCombatStrategy: (id: number, strategy: CombatSubStrategy) => void
    /** 设置单个角色的行为原点更新策略（切换时按策略复位原点） */
    setOriginStrategy: (id: number, strategy: OriginSubStrategy) => void
    /** 设置单个角色的漫游者原点更新间隔（秒） */
    setOriginInterval: (id: number, seconds: number) => void
    /** 设置单个角色的追击活动半径（m） */
    setChaseLeashRadius: (id: number, radius: number) => void
    /** 设置单个角色的 AI 反应式举盾窗口时长（秒） */
    setAIBlockDuration: (id: number, seconds: number) => void
    /** 设置单个角色的 AI 反应式举盾冷却（秒） */
    setAIBlockCooldown: (id: number, seconds: number) => void
    /** 读取角色行为原点世界坐标（AI 未激活时返回 undefined；返回副本避免外部改写运行时状态） */
    getOrigin: (id: number) => {x: number; y: number; z: number} | undefined
    /** 设置角色当前韧性（自动夹取到 0..poiseMax，用于面板调节） */
    setPoise: (id: number, value: number) => void
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
    const appearanceModels = new Map<number, CreatureModel>()
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
            ...(entity.combat.weapon.mountJointId !== undefined ? {mainMountJointId: entity.combat.weapon.mountJointId} : {}),
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
    let playerSwimLift = 0
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
    const getModel = (id: number): CreatureModel | undefined => appearanceModels.get(id)
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
        const radius = formBodyRadius(entity.config) + 0.25
        const halfHeight = originToCenterY(entity.config)
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
        swimming: 'entity.state.swimming',
        floating: 'entity.state.floating',
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
        const weaponName = weaponDisplayName(weapon)
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
        originStrategy: OriginSubStrategy = 'resident',
        originInterval: number = DEFAULT_ROAMER_INTERVAL,
        chaseLeashRadius: number = DEFAULT_CHASE_LEASH_RADIUS,
        aiBlockDuration: number = DEFAULT_AI_BLOCK_DURATION,
        aiBlockCooldown: number = DEFAULT_AI_BLOCK_COOLDOWN,
    ): CharacterEntity => {
        /* 体形计划（骨架 / 外观 / 碰撞布局 / 受击子块 / 装备槽 / 武器策略）：缺省 = 人形 */
        const plan = bodyFormOf(config.bodyFormId)
        /* 武器运行时（武器预设 + 存档数值覆写）：外观武器模型、攻击链、血量档位都由它决定。
         * 武器只属于一种体形：存档武器 id 与体形不符（旧档 / 手改）时回退该体形默认武器。 */
        const requested = weaponRuntimeOf(attack)
        const runtime = requested.weapon.formId === plan.id ? requested : weaponRuntimeOf({weaponId: plan.defaultWeaponId})
        /* 副手武器运行时（可选）：单持 / 双持时装备，双手共持时挂背；主武器为远程时不展示；
         * 同样要求副手武器属于当前体形，否则丢弃 */
        const requestedOffhand = offhandAttack !== undefined ? weaponRuntimeOf(offhandAttack) : undefined
        const offhandRuntime = requestedOffhand !== undefined && requestedOffhand.weapon.formId === plan.id
            ? requestedOffhand
            : undefined
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

        const model = plan.createModel(config, faction)
        /* 主手为远程时不展示副手（副手仅服务近战三持握模组）；近战时副手挂左手（默认单持） */
        model.equipWeapon({
            main: runtime.weapon.mesh,
            ...(runtime.weapon.mountJointId !== undefined ? {mainMountJointId: runtime.weapon.mountJointId} : {}),
            ...(runtime.weapon.type === 'melee' ? {offhand: offhandRuntime?.weapon.mesh} : {}),
        })
        model.group.position.set(x, y, z)
        scene.add(model.group)

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .lockRotations()
            .setLinearDamping(CHARACTER_LINEAR_DAMPING)
            .setTranslation(x, y + halfH, z)
        const body = world.createRigidBody(bodyDesc)

        /* 碰撞体由体形计划声明（人形 = 上下半竖直胶囊，见 body_form）：首个碰撞体承担地面 / 分离主引用。
         * 竖直胶囊：平底 cuboid 跨过 trimesh 网格顶点线时会被内部棱幽灵水平法线卡死（上坡原地卡住），
         * 圆滑底面无挂点；rapier3d-compat 0.19/0.20 的 FIX_INTERNAL_EDGES 已损坏（开启即穿透）不可用 */
        const colliders = plan.colliderLayout.map(spec => createColliderForBody(world, makeColliderDescForSpec(spec, config.scale), body))
        const mainCollider = colliders[0]
        /* 质量恒为 1（对齐 cannon-es master）：击退/磁力/浮力均按 mass=1 计算。
         * 不设置的话 Rapier 按密度 1 × 体积（≈0.04）计算，击退冲量会被放大 25 倍 */
        setBodyMass(body, 1)

        const id = nextId++
        const stateMachine = createCharacterStateMachine()
        /* 生命值档位：体形可覆写（缺省 = 沿用武器类型档位：近战 15 / 远程 8） */
        const maxHP = plan.baseHealth ?? (runtime.weapon.type === 'melee' ? 15 : 8)

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
            colliders,
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
            originStrategy,
            originInterval,
            chaseLeashRadius,
            aiBlockDuration,
            aiBlockCooldown,
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
            environment: createBodyEnvironment(),
            hurtProfile: plan.hurtProfile,
            hurtBlocks: plan.hurtProfile.map(b => zeroWorldHurtBlock(b.id)),
            stateMachine,
        }

        bodyCharMap.set(body.handle, entity)
        charById.set(entity.id, entity)
        meshBodyHandle.set(entity.mesh, body.handle)
        characters.push(entity)
        appearanceModels.set(entity.id, model)
        /* 体形专属动画系统（每个体形分包自带 base_clips/pose_fns 与调度实现） */
        appearanceSystems.set(entity.id, plan.createAnimation({onAttackEvent}))
        weaponTrails.set(entity.id, createWeaponTrail(scene))
        const hitBoxes = createAttackHitBoxes(scene)
        attackHitBoxes.set(entity.id, hitBoxes)
        /* 生成时即定位调试线框（编辑暂停态 update 不运行，避免线框滞留在原点）；
         * 可见性由选中状态驱动（refreshSelectionVisibility），未选中时全部隐藏；
         * placeDebugBoxes 接收的是物理中心坐标 */
        placeDebugBoxes(entity, x, y + halfH, z, 0)

        materialEffects.set(entity.id, createMaterialEffects(entity))
        entity.combat.onDamageTaken = (amount: number, event) => {
            /* 按 id 查效果（体形切换重建外观后替换 map 条目即可，无需重绑回调） */
            materialEffects.get(entity.id)?.onDamage(amount)
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

        /* 击杀钩子（行为原点策略）：存活 → 死亡跳变时触发一次，按击杀者原点策略迁移原点。
         * 边界：非伤害来源 / 自伤 / 击杀者缺失或已死 / 友军误伤 → 全部跳过 */
        entity.combat.onDeath = (sourceId) => {
            if (sourceId === undefined || sourceId === entity.id) return
            const killer = characters.find(c => c.id === sourceId)
            if (!killer || killer.combat.isDead) return
            if (!killer.combat.attackTendency(killer.combat.faction, entity.combat.faction)) return
            const killerCtx = aiMap.get(killer.id)
            if (!killerCtx) return
            const vp = entity.body.translation()
            const victimFootY = vp.y - originToCenterY(entity.config)
            notifyAIKill(killerCtx, killer, {x: vp.x, y: victimFootY, z: vp.z})
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

    /** 物理步：把真实物理位置写到渲染根（碰撞体同步需要真实位置，不能是插值位置） */
    const syncTrueTransforms = (): void => {
        for (const entity of characters) {
            if (entity.combat.isDead) continue
            const pos = entity.body.translation()
            /* 实体原点在脚底：物理中心回退半高得到原点 Y */
            const originY = pos.y - originToCenterY(entity.config)
            entity.mesh.position.set(pos.x, originY, pos.z)
            /* 碰撞箱可视化随身体朝向旋转（物理碰撞体为竖直胶囊，旋转对称不受影响） */
            entity.mesh.rotation.set(0, facingAngles.get(entity.id) ?? 0, 0)
            entity.appearanceGroup.position.set(pos.x, originY, pos.z)
        }
    }

    /** 物理步末：记录角色可视节点的真实变换，供渲染帧滞后一拍插值 */
    const captureRenderState = (): void => {
        for (const entity of characters) {
            if (entity.combat.isDead) continue
            captureObjectRenderPose(entity.mesh)
            captureObjectRenderPose(entity.appearanceGroup)
        }
    }

    /** 渲染帧：按 alpha 写插值后的可视变换（无历史时回退真实变换） */
    const syncPositions = (alpha = 1): void => {
        for (const entity of characters) {
            if (entity.combat.isDead) continue
            if (!applyRenderPose(entity.mesh, alpha)) {
                const pos = entity.body.translation()
                const originY = pos.y - originToCenterY(entity.config)
                entity.mesh.position.set(pos.x, originY, pos.z)
                entity.mesh.rotation.set(0, facingAngles.get(entity.id) ?? 0, 0)
            }
            if (!applyRenderPose(entity.appearanceGroup, alpha)) {
                /* 无插值历史（首帧 / 编辑暂停 / 体形重建）：位置跟随 mesh，姿态保留 update 写入的真实值 */
                entity.appearanceGroup.position.copy(entity.mesh.position)
            }
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
        const th = targetHitBoxHalves(entity.config)
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
            hitBoxes.rangeRing.position.set(x, y - originToCenterY(entity.config), z)
            hitBoxes.rangeRing.scale.set(weapon.range, 1, weapon.range)
            hitBoxes.rangeRing.visible = show
        } else {
            hitBoxes.rangeRing.visible = false
        }
        placeVisionFan(hitBoxes, losChecker, x, y + formEyeHeight(entity.config), z, yaw,
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
            /* 上/下半身半胶囊可视化：仅编辑（碰撞可见）模式显示 */
            const model = appearanceModels.get(entity.id)
            if (model !== undefined) {
                for (const m of model.colliderMeshes) m.visible = attackHitBoxVisible
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

    const setPlayerMove = (dx: number, dz: number, jump: boolean, forwardX: number, forwardZ: number, roll?: boolean, swimLift?: number): void => {
        playerDx = dx
        playerDz = dz
        /* 跳跃 / 翻滚是渲染帧采样的按下边沿：高刷下会出现「0 物理步」的渲染帧，
         * 必须锁存到下一个物理步消费，否则边沿会被 input.getUpdater() 清掉而丢输入 */
        playerJump = playerJump || jump
        playerRoll = playerRoll || (roll ?? false)
        playerSwimLift = swimLift ?? 0
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
        /* 副手盾仅在单持 / 双持时握在手中；双手共持时挂背，不接管按键 */
        const off = player.combat.offhand
        if (off !== undefined && player.holdMode !== 'two_handed'
            && off.weapon.type === 'melee' && off.weapon.block !== undefined) return ['heavy']
        return []
    }

    /**
     * 玩家按下攻击键：
     * - **后摇窗口内按下 = 连段预输入**：写单帧脉冲（段末消费推进下一段），动作阶段（抬手 / 挥斩 / 蓄力中）的按键一律忽略；
     * - 其余情况：可蓄力攻击（远程弓 / 投掷、近战重击）进入蓄力（按住期间冻结并累积力度）；盾键转入举盾计时。
     */
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
        /* 后摇窗口内按下攻击键：写连段预输入脉冲（按住计时吞掉松开时的补脉冲，避免重复出招） */
        if (player.combat.attackActive && inRecoveryWindow(player.combat)) {
            playerAttackHeld = true
            setPlayerAttack(key, 0)
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

    /** 复用向量：玩家渲染插值位置（身体中心，供相机 / HUD 使用；禁止逐帧分配） */
    const _playerRenderPos = {x: 0, y: 0, z: 0}
    const getPlayerRenderPosition = (): {readonly x: number; readonly y: number; readonly z: number} | undefined => {
        const player = getPlayerCharacter()
        if (player === undefined) return undefined
        _playerRenderPos.x = player.mesh.position.x
        _playerRenderPos.y = player.mesh.position.y + originToCenterY(player.config)
        _playerRenderPos.z = player.mesh.position.z
        return _playerRenderPos
    }

    /** 传送 / 体形重建 / 瞬移后重置插值历史，避免从旧位置插值滑行 */
    const resetRenderState = (id: number): void => {
        const entity = charById.get(id)
        if (entity === undefined) return
        resetObjectRenderPose(entity.mesh)
        resetObjectRenderPose(entity.appearanceGroup)
    }
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

    /** 每帧在 area 场写入前清零全部角色的环境场（main.ts 在每个 preSync 循环前调用） */
    const clearEnvironments = (): void => {
        for (const entity of characters) resetBodyEnvironment(entity.environment)
    }

    /**
     * 环境场应用（状态机之后）：area 场（浮力 / 风 / 方向重力）写入的额外加速度与流速
     * 在此叠加到速度。必须晚于 `stateMachine.update`——否则水平分量会被各 handler 的
     * `setLinvel` 绝对覆写抹掉（这正是水此前对角色「无效」的根因）。
     */
    /* 受击子块世界化复用对象（闭包级，仅创建一次） */
    const _hurtZero: {x: number; y: number; z: number} = {x: 0, y: 0, z: 0}
    const _hurtHalf: {x: number; y: number; z: number} = {x: 0, y: 0, z: 0}

    const copyOBBInto = (out: WorldHurtBlock, obb: OBB): void => {
        out.kind = 'box'
        out.center.x = obb.center.x; out.center.y = obb.center.y; out.center.z = obb.center.z
        for (let a = 0; a < 3; a++) {
            out.axes[a].x = obb.axes[a].x
            out.axes[a].y = obb.axes[a].y
            out.axes[a].z = obb.axes[a].z
        }
        out.half.x = obb.half.x; out.half.y = obb.half.y; out.half.z = obb.half.z
        out.radius = 0; out.halfHeight = 0
    }

    const copyWorldInto = (out: WorldHurtBlock, src: WorldHurtBlock): void => {
        out.kind = src.kind
        out.center.x = src.center.x; out.center.y = src.center.y; out.center.z = src.center.z
        for (let a = 0; a < 3; a++) {
            out.axes[a].x = src.axes[a].x
            out.axes[a].y = src.axes[a].y
            out.axes[a].z = src.axes[a].z
        }
        out.half.x = src.half.x; out.half.y = src.half.y; out.half.z = src.half.z
        out.radius = src.radius; out.halfHeight = src.halfHeight
    }

    /**
     * 逐帧世界化受击子块（动画 + 根姿态之后调用）：
     * 优先按关节上的视觉部件矩阵 + 几何尺寸（自动含骨骼段长度与粗细）；
     * 无部件时退回关节矩阵 + 预设形状常量。
     */
    const refreshHurtBlocks = (entity: CharacterEntity, model: CreatureModel): void => {
        const profile = entity.hurtProfile
        const out = entity.hurtBlocks
        if (profile === undefined || out === undefined) return
        model.group.updateMatrixWorld(true)
        for (let i = 0; i < profile.length && i < out.length; i++) {
            const def = profile[i]
            const part = model.jointParts.get(def.jointId)
            if (part !== undefined) {
                const params = part.geometry.parameters as unknown as {width: number; height: number; depth: number}
                _hurtHalf.x = params.width / 2
                _hurtHalf.y = params.height / 2
                _hurtHalf.z = params.depth / 2
                copyOBBInto(out[i], obbFromTransform(part.mesh.matrixWorld.elements, _hurtZero, _hurtHalf))
                continue
            }
            const group = model.jointGroups.get(def.jointId)
            if (group === undefined) continue
            group.updateWorldMatrix(true, false)
            copyWorldInto(out[i], worldizeHurtBlock(def, group.matrixWorld.elements))
        }
    }

    /* 半胶囊碰撞体随碰撞节点（lowerBodyCollider / upperBodyCollider）相对模型根的变换同步。
     * 关键：使用「节点相对模型根」的变换（排除模型根的朝向 / 姿势合成），
     * 使静止时与竖直拼接完全等价、且随动画（如脊柱扭转）联动，不与翻滚/倒地根姿态耦合。 */
    const _colliderPos = new Vector3()
    const _colliderQuat = new Quaternion()
    const _relMatrix = new Matrix4()
    const _rootInv = new Matrix4()

    const syncColliderFromNode = (
        collider: RAPIER.Collider | undefined,
        group: Object3D | undefined,
        rootGroup: Object3D,
        scale: number,
        centerY: number,
    ): void => {
        if (collider === undefined || group === undefined) return
        group.updateWorldMatrix(true, false)
        rootGroup.updateWorldMatrix(true, false)
        _rootInv.copy(rootGroup.matrixWorld).invert()
        _relMatrix.multiplyMatrices(_rootInv, group.matrixWorld)
        _colliderPos.setFromMatrixPosition(_relMatrix)
        _colliderQuat.setFromRotationMatrix(_relMatrix)
        /* 模型根（脚底）→ 刚体中心：Y 平移 -centerY；模型根均匀缩放 scale 需还原到节点局部 */
        collider.setTranslationWrtParent({
            x: _colliderPos.x * scale,
            y: _colliderPos.y * scale - centerY,
            z: _colliderPos.z * scale,
        })
        collider.setRotationWrtParent({x: _colliderQuat.x, y: _colliderQuat.y, z: _colliderQuat.z, w: _colliderQuat.w})
    }

    /** 用体形碰撞节点相对模型根的变换驱动全部碰撞体；缺省节点时保留静态拼接。 */
    const syncCollidersFromNodes = (entity: CharacterEntity, model: CreatureModel): void => {
        const layout = bodyFormOf(entity.config.bodyFormId).colliderLayout
        const scale = entity.config.scale
        const centerY = originToCenterY(entity.config)
        for (let i = 0; i < layout.length && i < entity.colliders.length; i++) {
            const node = model.jointGroups.get(layout[i].nodeId)
            if (node === undefined) continue
            syncColliderFromNode(entity.colliders[i], node, model.group, scale, centerY)
        }
    }

    const applyEnvironment = (entity: CharacterEntity, dt: number): void => {
        const env = entity.environment
        const hasAccel = env.accel.x !== 0 || env.accel.y !== 0 || env.accel.z !== 0
        if (!hasAccel && env.flowBlend <= 0) return
        const blend = env.flowBlend > 0 ? Math.min(1, env.flowBlend * dt) : 0
        const v = entity.body.linvel()
        entity.body.setLinvel({
            x: v.x + (env.flow.x - v.x) * blend + env.accel.x * dt,
            y: v.y + (env.flow.y - v.y) * blend + env.accel.y * dt,
            z: v.z + (env.flow.z - v.z) * blend + env.accel.z * dt,
        }, true)
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
                entity.stateMachine.setInput(playerDx, playerDz, playerJump, playerAttackPending, playerRoll, playerAttackKey, playerAttackHoldDuration, playerAttackHeld, playerInteractPending, playerBlockHeld, playerSwimLift)
                /* 攻击期间（含待起手帧）瞄准方向持续取相机前方：角色随之转向瞄准方向，
                 * 射击弹道再由武器实际朝向（muzzleDir）决定，避免背身射向目标 */
                if (playerAttackPending || entity.combat.attackActive) {
                    entity.combat.attackDirX = playerForwardX
                    entity.combat.attackDirZ = playerForwardZ
                }
            }

            entity.stateMachine.update(dt, entity)
            /* 环境场（area）在状态机之后叠加，避免被状态机水平速度覆写抹掉 */
            applyEnvironment(entity, dt)
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

                /* 持盾手（可能双手各持一盾）：格挡姿态据此决定抬哪只手臂，基础姿态据此校正盾面朝向。
                 * 双手共持时副手盾挂背、不计入（与 `updateShieldBlock` 的盾来源一致）。 */
                const mainWeapon = entity.combat.weapon
                const offWeapon = entity.combat.offhand
                const shieldHands = {
                    main: mainWeapon.type === 'melee' && mainWeapon.block !== undefined,
                    off: entity.holdMode !== 'two_handed'
                        && offWeapon !== undefined && offWeapon.weapon.type === 'melee' && offWeapon.weapon.block !== undefined,
                }

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
                    shieldHands,
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
                    /* 根自转圈数按体形（四足 0 = 低伏冲刺不做前滚翻；缺省 1 = 前滚翻一周） */
                    const rollTurns = bodyFormOf(entity.config.bodyFormId).rollSpinTurns ?? 1
                    _rollSpinQuat.setFromAxisAngle(_rollAxis, Math.PI * 2 * rollTurns * rollSpinProgress(
                        entity.stateMachine.stateTime,
                        entity.combat.rollSkill.config.duration,
                    ))
                    _rollYawQuat.setFromAxisAngle(_upAxis, newAngle)
                    model.group.quaternion.copy(_rollYawQuat).multiply(_rollSpinQuat)
                    _rollPivot.set(0, originToCenterY(entity.config), 0)
                    _rollOffset.copy(_rollPivot).applyQuaternion(model.group.quaternion)
                    model.group.position.add(_rollPivot).sub(_rollOffset)
                } else if (entity.stateMachine.currentState === 'swimming') {
                    /* 俯卧游泳：绕本地 X 轴前倾（face-down），绕身体中心做位置补偿（同翻滚） */
                    _swimPitchQuat.setFromAxisAngle(_rollAxis, SWIM_PRONE_PITCH)
                    _rollYawQuat.setFromAxisAngle(_upAxis, newAngle)
                    model.group.quaternion.copy(_rollYawQuat).multiply(_swimPitchQuat)
                    _rollPivot.set(0, originToCenterY(entity.config), 0)
                    _rollOffset.copy(_rollPivot).applyQuaternion(model.group.quaternion)
                    model.group.position.add(_rollPivot).sub(_rollOffset)
                } else {
                    /* 运行时朝向仅绕 Y（清除编辑态可能残留的 X/Z 视觉倾斜） */
                    model.group.rotation.set(0, newAngle, 0)
                }
                /* 碰撞箱可视化同步跟随身体朝向 */
                entity.mesh.rotation.set(0, newAngle, 0)

                /* 俯卧游泳：让上/下半身碰撞节点前倾，使 B2 驱动的半胶囊随之俯卧（与视觉一致） */
                {
                    const swimPitch = entity.stateMachine.currentState === 'swimming' ? SWIM_PRONE_PITCH : 0
                    const lowerNode = model.jointGroups.get('lowerBodyCollider')
                    const upperNode = model.jointGroups.get('upperBodyCollider')
                    if (lowerNode !== undefined) lowerNode.rotation.x = swimPitch
                    if (upperNode !== undefined) upperNode.rotation.x = swimPitch
                }

                /* 受击子块世界化（动画 + 根姿态之后；命中检定读取 entity.hurtBlocks） */
                refreshHurtBlocks(entity, model)
                /* 上半身/下半身半胶囊碰撞箱随骨骼（碰撞节点）同步 */
                syncCollidersFromNodes(entity, model)

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
                    /* 受击箱：有受击子块时逐块显示（与判定形状一致）；无则回退单一身体盒 */
                    const hurtBlocks = entity.hurtBlocks
                    if (showDebug && hurtBlocks !== undefined && hurtBlocks.length > 0) {
                        hitBoxes.targetBox.visible = false
                        for (let bi = 0; bi < hitBoxes.hurtBoxes.length; bi++) {
                            const box = hitBoxes.hurtBoxes[bi]
                            if (bi < hurtBlocks.length) {
                                syncHurtDebugBox(box, hurtBlocks[bi])
                                box.visible = true
                            } else {
                                box.visible = false
                            }
                        }
                    } else {
                        const th = targetHitBoxHalves(entity.config)
                        hitBoxes.targetBox.position.set(bPos.x, bPos.y, bPos.z)
                        hitBoxes.targetBox.scale.set(th.x * 2, th.y * 2, th.z * 2)
                        /* 受击箱随身体朝向旋转（与判定的 OBB 几何一致） */
                        hitBoxes.targetBox.rotation.y = yaw
                        hitBoxes.targetBox.visible = showDebug
                        for (const box of hitBoxes.hurtBoxes) box.visible = false
                    }

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
                        hitBoxes.rangeRing.position.set(bPos.x, bPos.y - originToCenterY(entity.config), bPos.z)
                        hitBoxes.rangeRing.scale.set(debugWeapon.range, 1, debugWeapon.range)
                        hitBoxes.rangeRing.visible = true
                    } else {
                        hitBoxes.rangeRing.visible = false
                    }

                    /* 视线扇形（蓝）：每 10° 一条扫描射线（截断到遮挡点），战斗目标存在时画连线 */
                    if (showDebug) {
                        const eyeY = bPos.y + formEyeHeight(entity.config)
                        const fanLen = debugWeapon.detectionRange
                        let tx: number | undefined
                        let ty: number | undefined
                        let tz: number | undefined
                        if (aiCtx && aiCtx.activeFsm === 'combat' && aiCtx.combatTargetId !== undefined) {
                            const target = charById.get(aiCtx.combatTargetId)
                            if (target && !target.combat.isDead) {
                                const tp = target.body.translation()
                                tx = tp.x
                                ty = tp.y + formEyeHeight(target.config)
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
            const sep = computeSeparation({
                aiX: aPos.x, aiZ: aPos.z,
                ajX: bPos.x, ajZ: bPos.z,
                radiusA: formBodyRadius(ai.config),
                radiusB: formBodyRadius(aj.config),
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
                /* 原点/出生锚点统一取脚底 Y（与 origin.ts 的 setOriginFromCharacter 同源），避免策略迁移后 Y 语义不一致 */
                const originY = pos.y - originToCenterY(entity.config)
                const ctx = createAIMachine(
                    entity,
                    pos.x, originY, pos.z,
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
                            tPos, targetHitBoxHalves(target.config), facingAngles.get(target.id) ?? 0,
                        )
                    },
                    /* 视线扇形门控用的实时朝向（findNearestEnemy 每帧读取） */
                    () => facingAngles.get(entity.id) ?? 0,
                    entity.originStrategy,
                    entity.originInterval,
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
            /* 体形计划：已知 id 才写入（未知 / 缺省安全回退 humanoid） */
            ...(saveConfig.bodyFormId !== undefined && isKnownBodyFormId(saveConfig.bodyFormId) ? {bodyFormId: saveConfig.bodyFormId} : {}),
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
        const entity = spawnEntity(cfg, saveConfig.attack, offhandAttack, saveConfig.tendency, saveConfig.faction, x, y, z, saveConfig.isPlayer, saveConfig.peaceStrategy ?? 'patrol', saveConfig.combatStrategy ?? 'tactical', saveConfig.navEnabled ?? true, saveConfig.originStrategy ?? 'resident', saveConfig.originInterval ?? DEFAULT_ROAMER_INTERVAL, saveConfig.chaseLeashRadius ?? DEFAULT_CHASE_LEASH_RADIUS, saveConfig.aiBlockDuration ?? DEFAULT_AI_BLOCK_DURATION, saveConfig.aiBlockCooldown ?? DEFAULT_AI_BLOCK_COOLDOWN)
        /* 持握模式：存档支持时应用，武器不支持时 setHoldMode 回退默认模式（不抛错） */
        if (saveConfig.holdMode !== undefined) setHoldMode(entity.id, saveConfig.holdMode)
        /* 防御 / 攻击 / 护甲 / 肢体：旧档缺字段回退零防御零攻击空装备；未知 id 由 resolve*Loadout 安全剔除 */
        setCombatEquipment(entity.combat, saveConfig.defense ?? ZERO_PROFILE, saveConfig.armor ?? {}, saveConfig.limb ?? {}, saveConfig.baseAttack ?? ZERO_PROFILE)
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
        /* 编辑态瞬移：重置插值历史，避免从旧位置插值滑行 */
        resetObjectRenderPose(entity.mesh)
        resetObjectRenderPose(entity.appearanceGroup)
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
            setCombatWeapon(entity.combat, runtimeForHoldMode(entity.combat.weapon, mode), mode)
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

    const updateCharacterConfig = (id: number, charCfg: Partial<CharacterConfig>, newAttackSlot?: AttackConfig, newFaction?: number, newMaxHealth?: number, newTendencyConfig?: TendencyConfig, newHealth?: number, newEquipment?: {baseDefense?: DefenseProfile; baseAttack?: DamageTypeProfile; armor?: ArmorLoadout; limb?: LimbLoadout}, newOffhand?: AttackConfig | null): void => {
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

            for (const collider of entity.colliders) world.removeCollider(collider, true)
            /* 碰撞体参数与 spawnEntity 一致（随 scale 缩放）：按体形计划 colliderLayout 重建 */
            const layout = bodyFormOf(entity.config.bodyFormId).colliderLayout
            const rebuilt = layout.map(spec => createColliderForBody(world, makeColliderDescForSpec(spec, entity.config.scale), entity.body))
            entity.colliders = rebuilt
            entity.mainCollider = rebuilt[0]
            /* 重建后刷新总质量（碰撞体密度 0，质量仍为 1） */
            setBodyMass(entity.body, 1)
            entity.body.wakeUp()
            /* 物理中心随新半高上移，mesh/外观模型原点（脚底）保持不变 */
            entity.body.setTranslation({ x: bodyPos.x, y: originY + originToCenterY(entity.config), z: bodyPos.z }, true)

            updateCharacterMesh(entity.mesh, entity.config)
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
            const plan = bodyFormOf(entity.config.bodyFormId)
            /* 体形武器白名单过滤：面板 Apply 会在切体形后提交「旧体形的选择」，
             * 须按**新体形**的允许集剔除，否则狼 / 龙会被装上白名单外的武器（绕过 setBodyForm 的回退）。 */
            let changed = false
            if (newAttackSlot !== undefined) {
                const mainWeapon = weaponRuntimeOf(newAttackSlot)
                if (weaponSelectableFor(plan, mainWeapon.weapon)) {
                    setCombatWeapon(entity.combat, mainWeapon)
                    changed = true
                }
            }
            if (newOffhand !== undefined) {
                const offWeapon = newOffhand === null ? undefined : weaponRuntimeOf(newOffhand)
                if (offWeapon === undefined || weaponSelectableFor(plan, offWeapon.weapon)) {
                    setCombatOffhand(entity.combat, offWeapon)
                    changed = true
                }
            }
            if (changed) {
                /* 持握模式重置为该武器支持的首个模式（面板随后可再显式 setHoldMode），清空段冷却与当前段 */
                entity.holdMode = defaultHoldMode(entity.combat.weapon)
                /* 新模式可能使副手盾挂背（双手共持）：重解析盾来源 */
                updateShieldBlock(entity.combat, entity.holdMode)
                entity.combat.activeSegment = undefined
                entity.combat.bufferedSegment = undefined
                entity.combat.segmentCooldowns.clear()
                syncWeaponAppearance(entity)
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
            /* 基础防御 / 基础攻击 / 护甲 / 肢体变更：重算防御、攻击加成与移速并同步外观（未传项保持原值）。
             * 按**当前体形**装备槽过滤（切体形后提交的旧槽位装备须剔除，避免无槽体形获得护甲数值）。 */
            const plan = bodyFormOf(entity.config.bodyFormId)
            const filtered = filterEquipLoadouts(
                plan.equipSlots,
                newEquipment.armor ?? entity.combat.armor ?? {},
                newEquipment.limb ?? entity.combat.limb ?? {},
            )
            setCombatEquipment(
                entity.combat,
                newEquipment.baseDefense ?? entity.combat.baseDefense,
                filtered.armor,
                filtered.limb,
                newEquipment.baseAttack,
            )
            const model = appearanceModels.get(entity.id)
            if (model) {
                if (newEquipment.armor !== undefined) model.equipArmor(resolveArmorLoadout(entity.combat.armor))
                if (newEquipment.limb !== undefined) model.equipLimbs(resolveLimbLoadout(entity.combat.limb))
            }
        }
        refreshPlayerLabel()
    }

    /**
     * 运行时切换体形（基础模组）：重建骨架 / 外观 / 碰撞体 / 受击子块，重解析武器与装备，重设数值。
     * 脚底原点保持不变；未知 id 或切换为同一体形时安全返回 false。
     */
    const setBodyForm = (id: number, planId: string): boolean => {
        const entity = characters.find(c => c.id === id)
        if (entity === undefined) return false
        const plan = bodyFormOf(planId)
        /* 未知 id 拒绝（不静默回退）；同一体形无操作 */
        if (plan.id !== planId) return false
        if (bodyFormOf(entity.config.bodyFormId).id === plan.id) return false

        const bodyPos = entity.body.translation()
        const originY = bodyPos.y - originToCenterY(entity.config)
        const oldModel = appearanceModels.get(entity.id)
        /* 记录当前朝向：编辑暂停态 update 不运行（不会每帧写回 model.group 朝向），
         * 重建模型后必须复原，否则新体形会复位到 +Z 正前方、丢失当前朝左 / 朝后的朝向 */
        const oldFacingQuat = oldModel?.group.quaternion.clone()

        /* 1) 记录体形 id（humanoid 用缺省表示，便于旧档兼容） */
        if (plan.id === HUMANOID_BODY_FORM.id) delete entity.config.bodyFormId
        else entity.config.bodyFormId = plan.id

        /* 2) 武器策略：武器只属于一种体形 → 切体形一律落到新体形默认武器（不跨体形沿用） */
        setCombatWeapon(entity.combat, weaponRuntimeOf({weaponId: plan.defaultWeaponId}))
        entity.holdMode = defaultHoldMode(entity.combat.weapon)
        setCombatOffhand(entity.combat, undefined)

        /* 3) 装备过滤：剔除该体形不支持的护甲 / 肢体槽，重算防御 / 加成 / 移速 */
        const {armor, limb} = filterEquipLoadouts(plan.equipSlots, entity.combat.armor, entity.combat.limb)
        setCombatEquipment(entity.combat, entity.combat.baseDefense, armor, limb, entity.combat.baseAttack)

        /* 4) 重建外观模型（dispose 旧模型 → 按新 plan 建模型） */
        if (oldModel !== undefined) {
            scene.remove(oldModel.group)
            oldModel.dispose()
        }
        const model = plan.createModel(entity.config, entity.combat.faction)
        appearanceModels.set(entity.id, model)
        entity.appearanceGroup = model.group
        /* 动画系统亦按新体形重建：否则切体形后仍由旧体形的动作数据驱动（关节不匹配 → 冻结） */
        appearanceSystems.set(entity.id, plan.createAnimation({onAttackEvent}))

        /* 5) 生命值档位：体形覆写（缺省沿用武器类型档位） */
        const maxHP = plan.baseHealth ?? (entity.combat.weapon.type === 'melee' ? 15 : 8)
        entity.combat.maxHealth = maxHP
        if (entity.combat.health > maxHP) entity.combat.health = maxHP

        /* 6) 受击子块与碰撞体按新 plan 重建 */
        entity.hurtProfile = plan.hurtProfile
        entity.hurtBlocks = plan.hurtProfile.map(b => zeroWorldHurtBlock(b.id))
        for (const collider of entity.colliders) world.removeCollider(collider, true)
        const rebuilt = plan.colliderLayout.map(spec => createColliderForBody(world, makeColliderDescForSpec(spec, entity.config.scale), entity.body))
        entity.colliders = rebuilt
        entity.mainCollider = rebuilt[0]
        setBodyMass(entity.body, 1)
        entity.body.wakeUp()

        /* 7) 装配外观：武器 / 护甲 / 肢体 / 持握 / 阵营色 */
        model.group.position.set(bodyPos.x, originY, bodyPos.z)
        if (oldFacingQuat !== undefined) model.group.quaternion.copy(oldFacingQuat)
        scene.add(model.group)
        model.equipArmor(resolveArmorLoadout(entity.combat.armor))
        model.equipLimbs(resolveLimbLoadout(entity.combat.limb))
        syncWeaponAppearance(entity)
        model.recolor(SELECT_PALETTE(entity.combat.faction))
        updateShieldBlock(entity.combat, entity.holdMode)
        /* 材质效果重绑到新外观（旧快照作废） */
        materialEffects.set(entity.id, createMaterialEffects(entity))

        /* 8) 物理中心随新体形中心偏移重定位（脚底不动），调试胶囊 mesh 同步 */
        entity.body.setTranslation({x: bodyPos.x, y: originY + originToCenterY(entity.config), z: bodyPos.z}, true)
        entity.mesh.position.set(bodyPos.x, originY, bodyPos.z)
        updateCharacterMesh(entity.mesh, entity.config)
        if (entity.wireframe) {
            entity.mesh.remove(entity.wireframe)
            entity.wireframe.geometry.dispose()
            ;(entity.wireframe.material as LineBasicMaterial).dispose()
            const newWire = createWireframe(entity.mesh.geometry)
            entity.mesh.add(newWire)
            entity.wireframe = newWire
        }

        refreshPlayerLabel()
        /* 体形重建：新外观节点无插值历史，按重建后的真实位姿初始化 */
        resetObjectRenderPose(entity.mesh)
        resetObjectRenderPose(entity.appearanceGroup)
        return true
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

    /** 切换行为原点策略并复位原点：roamer → 当前位置；resident / fighter / hunter → 初始锚点 */
    const setOriginStrategy = (id: number, strategy: OriginSubStrategy): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.originStrategy = strategy
        const ctx = aiMap.get(id)
        if (!ctx) return
        ctx.originStrategy = strategy
        ctx.originConfig = DEFAULT_ORIGIN_CONFIGS[strategy]
        ctx.originTimer = entity.originInterval > 0 ? entity.originInterval : ctx.originConfig.interval
        if (strategy === 'roamer') {
            setOriginFromCharacter(ctx, entity)
        } else {
            ctx.origin.x = ctx.spawnPoint.x
            ctx.origin.y = ctx.spawnPoint.y
            ctx.origin.z = ctx.spawnPoint.z
        }
    }

    const setOriginInterval = (id: number, seconds: number): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.originInterval = seconds
        const ctx = aiMap.get(id)
        if (!ctx) return
        /* 复制而非原地改共享默认对象，避免污染 DEFAULT_ORIGIN_CONFIGS */
        ctx.originConfig = {...ctx.originConfig, interval: seconds}
        ctx.originTimer = seconds
    }

    const setChaseLeashRadius = (id: number, radius: number): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.chaseLeashRadius = radius
    }

    /** 设置 AI 反应式举盾窗口时长（逐角色属性，shouldReactiveBlock 触发时读取） */
    const setAIBlockDuration = (id: number, seconds: number): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.aiBlockDuration = seconds
    }

    /** 设置 AI 反应式举盾冷却（逐角色属性，举盾窗口结束时读取） */
    const setAIBlockCooldown = (id: number, seconds: number): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.aiBlockCooldown = seconds
    }

    /** 读取角色行为原点（返回副本）：面板据此展示当前原点坐标，AI 未激活时为 undefined */
    const getOrigin = (id: number): {x: number; y: number; z: number} | undefined => {
        const ctx = aiMap.get(id)
        if (!ctx) return undefined
        return {x: ctx.origin.x, y: ctx.origin.y, z: ctx.origin.z}
    }

    /** 设置角色当前韧性：夹取到 0..poiseMax（受击 / 回充仍由战斗系统驱动） */
    const setPoise = (id: number, value: number): void => {
        const entity = characters.find(c => c.id === id)
        if (!entity) return
        entity.combat.poise = Math.max(0, Math.min(value, entity.combat.poiseMax))
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
        getPlayerRenderPosition,
        syncTrueTransforms,
        captureRenderState,
        resetRenderState,
        fixedUpdate: update,
        getHostileTo,
        getCharacterByBody,
        update,
        applySupportCarry,
        clearEnvironments,
        setAIEnabled,
        activateAI,
        add,
        setTransform,
        updateCharacterConfig,
        setBodyForm,
        setPeaceStrategy,
        setPeaceConfig,
        setCombatStrategy,
        setOriginStrategy,
        setOriginInterval,
        setChaseLeashRadius,
        setAIBlockDuration,
        setAIBlockCooldown,
        getOrigin,
        setPoise,
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
