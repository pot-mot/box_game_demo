import RAPIER from '@dimforge/rapier3d-compat'
import {createSharedWorld, type SharedWorld} from '../../../physics/world.ts'
import {createColliderForBody, quatFromAxisAngle, clearAllForces, setBodyMass} from '../../../physics/rapier_utils.ts'
import {createContactTracker, queryColliderContacts, type ContactTracker} from '../../../physics/contact_tracking.ts'
import {
    FIXED_TIME_STEP,
    DEFAULT_COLLISION_GROUP,
    DEFAULT_COLLISION_MASK,
    TERRAIN_COLLISION_GROUP,
    TERRAIN_COLLISION_MASK,
} from '../../../physics/constants.ts'
import {resolveGroundState, type GroundState} from './ground_state.ts'
import {computeSeparation} from './separation.ts'
import {CHARACTER_SEPARATION_SPEED, CHARACTER_LINEAR_DAMPING} from './constants.ts'
import {createCharacterStateMachine} from '../../../character/state_machine/machine.ts'
import {createSkillSlot} from '../../../character/combat/skill_types.ts'
import {MELEE_SKILL_PRESETS} from '../../../character/combat/melee_skill.ts'
import type {CharacterEntity} from '../../../character/types.ts'
import {CHARACTER_COLLISION_GROUP, CHARACTER_COLLISION_MASK, CHARACTER_BASE_SIZE} from '../constants.ts'

/** 测试固定时间步长（与游戏物理循环一致） */
export const DT = FIXED_TIME_STEP

/** 初始化 Rapier WASM（幂等，可重复调用） */
export const initRapier = (): Promise<void> => RAPIER.init()

/** 测试物理世界：真实 Rapier world + 事件总线 + 接触对跟踪器 */
export interface HarnessWorld {
    shared: SharedWorld
    tracker: ContactTracker
}

export const createHarnessWorld = (): HarnessWorld => {
    const shared = createSharedWorld()
    const tracker = createContactTracker(shared.eventBus)
    /* 与 main.ts 一致：每个物理子步结束后清除所有刚体累积力 */
    shared.eventBus.onStepEnd(() => clearAllForces(shared.world))
    return {shared, tracker}
}

/** 单物理子步 + 排空事件（与 main.ts 的顺序一致） */
export const stepWorld = (hw: HarnessWorld): void => {
    hw.shared.world.step(hw.shared.eventQueue)
    hw.shared.eventBus.drain()
}

/** 构造角色实体：真实 Rapier body + 碰撞体（摩擦 0、旋转锁定）+ 真实状态机 + combat mock */
export const makeChar = (
    hw: HarnessWorld,
    id: number,
    x: number,
    y: number,
    z: number,
    speed = 6,
): CharacterEntity => {
    const body = hw.shared.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
            .lockRotations()
            .setLinearDamping(CHARACTER_LINEAR_DAMPING)
            .setTranslation(x, y, z),
    )
    const mainCollider = createColliderForBody(
        hw.shared.world,
        RAPIER.ColliderDesc.cuboid(0.125, 0.5, 0.125)
            .setFriction(0)
            /* 密度 0（与生产一致） */
            .setDensity(0)
            .setCollisionGroups((CHARACTER_COLLISION_GROUP << 16) | (CHARACTER_COLLISION_MASK & 0xFFFF))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
    )
    /* 质量恒为 1（与生产 spawnEntity 一致） */
    setBodyMass(body, 1)

    const slot = createSkillSlot(MELEE_SKILL_PRESETS.long_sword_slash)
    const entity: CharacterEntity = {
        id,
        config: {speed, jumpHeight: 2, scale: 1},
        mesh: null!,
        wireframe: undefined,
        appearanceGroup: null!,
        body,
        mainCollider,
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        airborneTime: 0,
        groundedTime: 0,
        rowText: '',
        navEnabled: true,
        isPlayer: false,
        peaceStrategy: 'patrol',
        combatStrategy: 'tactical',
        isDying: false,
        dyingTimer: 0,
        dashCooldownTimer: 0,
        /* 测试专用最小 combat mock（集中窄化一次，避免测试文件散落 as unknown as） */
        combat: {
            faction: 0,
            health: 100,
            maxHealth: 100,
            isDead: false,
            damageModifiers: [],
            attackTendency: () => true,
            tendencyConfig: {tendencyId: 'hostileExceptSelf'},
            onDamageTaken: null,
            onDeath: null,
            onDamageDealt: null,
            skills: [slot],
            currentSkillIndex: 0,
            attackActive: false,
            attackTimer: 0,
            attackedTargets: new Set(),
            attackDirX: 0,
            attackDirZ: 0,
            swingTilt: 0,
            phaseIndex: 0, phaseTimer: 0, comboIndex: 0, comboTimer: 0, pendingFlinch: false,
        } as unknown as CharacterEntity['combat'],
        stateMachine: createCharacterStateMachine(),
    }
    return entity
}

/** 构造静态箱子（场景默认碰撞组，摩擦 0.5） */
export const makeStaticBox = (
    hw: HarnessWorld,
    x: number,
    y: number,
    z: number,
    hw_: number,
    hh: number,
    hd: number,
): RAPIER.RigidBody => {
    const body = hw.shared.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z),
    )
    createColliderForBody(
        hw.shared.world,
        RAPIER.ColliderDesc.cuboid(hw_, hh, hd)
            .setFriction(0.5)
            /* 密度 0（与生产一致：质量完全由附加质量决定） */
            .setDensity(0)
            .setCollisionGroups((DEFAULT_COLLISION_GROUP << 16) | (DEFAULT_COLLISION_MASK & 0xFFFF))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
    )
    return body
}

/** 构造动态箱子（场景默认碰撞组，摩擦 0.5，质量 = 参数 mass） */
export const makeDynamicBox = (
    hw: HarnessWorld,
    x: number,
    y: number,
    z: number,
    hw_: number,
    hh: number,
    hd: number,
    mass: number,
): RAPIER.RigidBody => {
    const body = hw.shared.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z),
    )
    createColliderForBody(
        hw.shared.world,
        RAPIER.ColliderDesc.cuboid(hw_, hh, hd)
            .setFriction(0.5)
            /* 密度 0（与生产一致） */
            .setDensity(0)
            .setCollisionGroups((DEFAULT_COLLISION_GROUP << 16) | (DEFAULT_COLLISION_MASK & 0xFFFF))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
    )
    setBodyMass(body, mass)
    return body
}

/**
 * 沿 X 上升的斜坡 Trimesh（与 master Heightfield 语义一致）：
 * heights[xi][zi] = slope * xi * cell，局部 X → 世界 X，局部 Y → 世界 -Z。
 */
export const makeSlope = (
    hw: HarnessWorld,
    slope: number,
    grid = 32,
    cell = 2,
): RAPIER.RigidBody => {
    const n = grid
    const vertices = new Float32Array(n * n * 3)
    for (let xi = 0; xi < n; xi++) {
        for (let zi = 0; zi < n; zi++) {
            const idx = (xi * n + zi) * 3
            vertices[idx] = xi * cell
            vertices[idx + 1] = slope * xi * cell
            vertices[idx + 2] = -zi * cell
        }
    }
    const indices: number[] = []
    for (let xi = 0; xi < n - 1; xi++) {
        for (let zi = 0; zi < n - 1; zi++) {
            const a = xi * n + zi
            const b = a + 1
            const d = a + n
            const e = d + 1
            indices.push(a, b, e)
            indices.push(a, e, d)
        }
    }
    const body = hw.shared.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0),
    )
    createColliderForBody(
        hw.shared.world,
        RAPIER.ColliderDesc.trimesh(vertices, new Uint32Array(indices))
            .setFriction(0.5)
            .setCollisionGroups((TERRAIN_COLLISION_GROUP << 16) | (TERRAIN_COLLISION_MASK & 0xFFFF))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
    )
    return body
}

/** 移除共享世界自带的默认地面（y=0 平面），供垂直墙用例使用 */
export const removeDefaultGround = (hw: HarnessWorld): void => {
    hw.shared.world.removeRigidBody(hw.shared.groundBody)
}

/**
 * 倾斜墙（θ=90° 垂直墙、θ=100° 倒悬墙）：
 * 用大薄板 cuboid 模拟半空间 —— 板的 +z 面过原点，绕 X 轴旋转 φ = -90° + θ。
 * 90° 时墙面位于 z=0；100° 时墙面法线朝下偏（倒悬）。
 */
export const makeWall = (hw: HarnessWorld, thetaDeg: number): RAPIER.RigidBody => {
    const phi = (-Math.PI / 2 + (thetaDeg * Math.PI) / 180)
    const quat = quatFromAxisAngle({x: 1, y: 0, z: 0}, phi)
    const body = hw.shared.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
            .setTranslation(0, 0, 0)
            .setRotation(quat),
    )
    createColliderForBody(
        hw.shared.world,
        RAPIER.ColliderDesc.cuboid(40, 40, 0.5)
            .setTranslation(0, 0, -0.5)
            .setFriction(0.5)
            .setCollisionGroups((TERRAIN_COLLISION_GROUP << 16) | (TERRAIN_COLLISION_MASK & 0xFFFF))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
    )
    return body
}

/** 单帧模拟（与游戏循环同序：step → 地面检测 → 状态机） */
export const tick = (
    hw: HarnessWorld,
    entity: CharacterEntity,
    gs: GroundState,
    dx: number,
    dz: number,
    jump = false,
): GroundState => {
    stepWorld(hw)
    const contacts = queryColliderContacts(
        hw.shared.world,
        entity.mainCollider,
        hw.tracker.pairsInvolving(entity.mainCollider.handle),
    )
    const next = resolveGroundState(contacts, entity.body.handle, gs, DT)
    entity.isOnGround = next.isOnGround
    entity.groundNormal = next.groundNormal
    entity.groundKeepTimer = next.groundKeepTimer
    entity.stateMachine.setInput(dx, dz, jump, false)
    entity.stateMachine.update(DT, entity)
    return next
}

/** 多角色单帧模拟（统一 step → 各角色地面检测 → 状态机 → 角色间分离，镜像 world.ts） */
export interface CharFrameState {
    gs: GroundState
    entity: CharacterEntity
}

export const tickMulti = (
    hw: HarnessWorld,
    states: CharFrameState[],
    inputs: Array<{dx: number; dz: number; jump?: boolean}>,
): void => {
    stepWorld(hw)

    for (let i = 0; i < states.length; i++) {
        const {entity} = states[i]
        const contacts = queryColliderContacts(
            hw.shared.world,
            entity.mainCollider,
            hw.tracker.pairsInvolving(entity.mainCollider.handle),
        )
        const gs = resolveGroundState(contacts, entity.body.handle, states[i].gs, DT)
        entity.isOnGround = gs.isOnGround
        entity.groundNormal = gs.groundNormal
        entity.groundKeepTimer = gs.groundKeepTimer
        states[i].gs = gs
    }

    for (let i = 0; i < states.length; i++) {
        const {entity} = states[i]
        entity.stateMachine.setInput(
            inputs[i].dx,
            inputs[i].dz,
            inputs[i].jump ?? false,
            false,
        )
        entity.stateMachine.update(DT, entity)
    }

    /* 强制水平分离重叠的角色（与 world.ts 的分离逻辑一致） */
    const byBody = new Map<number, CharacterEntity>()
    for (const s of states) byBody.set(s.entity.body.handle, s.entity)
    const separated = new Set<string>()
    for (const pair of hw.tracker.pairs.values()) {
        const colliderA = hw.shared.world.getCollider(pair.colliderAHandle)
        const colliderB = hw.shared.world.getCollider(pair.colliderBHandle)
        if (!colliderA || !colliderB) continue
        const bodyA = colliderA.parent()
        const bodyB = colliderB.parent()
        if (!bodyA || !bodyB) continue
        const ai = byBody.get(bodyA.handle)
        const aj = byBody.get(bodyB.handle)
        if (!ai || !aj) continue
        if (ai.combat.isDead || aj.combat.isDead) continue

        const key = ai.id < aj.id ? `${ai.id}-${aj.id}` : `${aj.id}-${ai.id}`
        if (separated.has(key)) continue
        separated.add(key)

        const maxHalf = Math.max(CHARACTER_BASE_SIZE.width, CHARACTER_BASE_SIZE.depth) / 2
        const aPos = bodyA.translation()
        const bPos = bodyB.translation()
        const sep = computeSeparation({
            aiX: aPos.x, aiZ: aPos.z,
            ajX: bPos.x, ajZ: bPos.z,
            radiusA: maxHalf * ai.config.scale,
            radiusB: maxHalf * aj.config.scale,
        }, CHARACTER_SEPARATION_SPEED)
        if (!sep) continue

        bodyA.setTranslation({x: aPos.x + sep.aiDx, y: aPos.y, z: aPos.z + sep.aiDz}, true)
        bodyB.setTranslation({x: bPos.x + sep.ajDx, y: bPos.y, z: bPos.z + sep.ajDz}, true)

        const aVel = bodyA.linvel()
        const bVel = bodyB.linvel()
        bodyA.setLinvel({x: aVel.x + sep.aiVx, y: aVel.y, z: aVel.z + sep.aiVz}, true)
        bodyB.setLinvel({x: bVel.x + sep.ajVx, y: bVel.y, z: bVel.z + sep.ajVz}, true)
    }
}

/** 两角色水平距离 */
export const hDist = (a: CharacterEntity, b: CharacterEntity): number => {
    const ta = a.body.translation()
    const tb = b.body.translation()
    return Math.hypot(ta.x - tb.x, ta.z - tb.z)
}

/** 初始地面状态 */
export const initGS = (): GroundState => ({
    isOnGround: true,
    groundNormal: {x: 0, y: 1, z: 0},
    groundKeepTimer: 0,
})
