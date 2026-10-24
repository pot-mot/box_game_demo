import type {Group, LineSegments, Mesh} from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type {CharacterConfig, CharacterEntity, CharacterState} from '../../character/types.ts'
import type {CombatComponent} from '../../character/combat/types.ts'
import type {BodyState, CharacterStateInit} from '../../character/state/types.ts'
import type {CharacterStateMachine} from '../../character/state_machine/types.ts'
import type {HurtBlockProfile, WorldHurtBlock} from '../../character/hurt_blocks.ts'
import type {LockPointConfig} from '../../character/lock_point.ts'
import type {BodyEnvironment} from '../../physics/environment.ts'
import type {CombatSubStrategy, OriginSubStrategy, PeaceSubStrategy} from '../../character/ai_strategy/types.ts'

/** 引擎句柄：只存运行时对象，不进入 CharacterState */
export interface CharacterRuntimeHandles {
    readonly body: RAPIER.RigidBody
    readonly mainCollider: RAPIER.Collider
    readonly colliders: RAPIER.Collider[]
    readonly mesh: Mesh
    readonly wireframe: LineSegments | undefined
    readonly appearanceGroup: Group
}

/**
 * 生产角色运行时句柄：`state` 是唯一游戏数据存储；
 * 其余同名属性只是委托到 `state` 的访问器，禁止在此另存值。
 */
export class CharacterRuntime implements CharacterEntity {
    readonly state: CharacterState
    readonly stateMachine: CharacterStateMachine
    body: RAPIER.RigidBody
    mainCollider: RAPIER.Collider
    colliders: RAPIER.Collider[]
    mesh: Mesh
    wireframe: LineSegments | undefined
    appearanceGroup: Group

    constructor(state: CharacterState, handles: CharacterRuntimeHandles, stateMachine: CharacterStateMachine) {
        this.state = state
        this.stateMachine = stateMachine
        this.body = handles.body
        this.mainCollider = handles.mainCollider
        this.colliders = handles.colliders
        this.mesh = handles.mesh
        this.wireframe = handles.wireframe
        this.appearanceGroup = handles.appearanceGroup
    }

    get id(): number { return this.state.identity.id }
    get config(): CharacterConfig { return this.state.config }
    set config(value: CharacterConfig) { this.state.config = value }
    get isPlayer(): boolean { return this.state.identity.isPlayer }
    set isPlayer(value: boolean) { this.state.identity.isPlayer = value }
    get rowText(): string { return this.state.identity.rowText }
    set rowText(value: string) { this.state.identity.rowText = value }

    get combat(): CombatComponent { return this.state.combat }
    set combat(value: CombatComponent) { this.state.combat = value }
    get bodyState(): BodyState { return this.state.bodyState }
    set bodyState(value: BodyState) { this.state.bodyState = value }
    get lockPoints(): readonly LockPointConfig[] { return this.state.lockPoints }
    set lockPoints(value: readonly LockPointConfig[]) { this.state.lockPoints = value }
    get environment(): BodyEnvironment { return this.state.environment }
    set environment(value: BodyEnvironment) { this.state.environment = value }
    get hurtProfile(): HurtBlockProfile | undefined { return this.state.hurtProfile }
    set hurtProfile(value: HurtBlockProfile | undefined) { this.state.hurtProfile = value }
    get hurtBlocks(): WorldHurtBlock[] | undefined { return this.state.hurtBlocks }
    set hurtBlocks(value: WorldHurtBlock[] | undefined) { this.state.hurtBlocks = value }

    get isOnGround(): boolean { return this.state.physics.isOnGround }
    set isOnGround(value: boolean) { this.state.physics.isOnGround = value }
    get groundNormal(): {readonly x: number; readonly y: number; readonly z: number} { return this.state.physics.groundNormal }
    set groundNormal(value: {readonly x: number; readonly y: number; readonly z: number}) { this.state.physics.groundNormal = value }
    get groundKeepTimer(): number { return this.state.physics.groundKeepTimer }
    set groundKeepTimer(value: number) { this.state.physics.groundKeepTimer = value }
    get groundBodyHandle(): number | null | undefined { return this.state.physics.groundBodyHandle }
    set groundBodyHandle(value: number | null | undefined) { this.state.physics.groundBodyHandle = value }
    get airborneTime(): number { return this.state.physics.airborneTime }
    set airborneTime(value: number) { this.state.physics.airborneTime = value }
    get groundedTime(): number { return this.state.physics.groundedTime }
    set groundedTime(value: number) { this.state.physics.groundedTime = value }

    get navEnabled(): boolean { return this.state.ai.navEnabled }
    set navEnabled(value: boolean) { this.state.ai.navEnabled = value }
    get peaceStrategy(): PeaceSubStrategy { return this.state.ai.peaceStrategy }
    set peaceStrategy(value: PeaceSubStrategy) { this.state.ai.peaceStrategy = value }
    get combatStrategy(): CombatSubStrategy { return this.state.ai.combatStrategy }
    set combatStrategy(value: CombatSubStrategy) { this.state.ai.combatStrategy = value }
    get originStrategy(): OriginSubStrategy { return this.state.ai.originStrategy }
    set originStrategy(value: OriginSubStrategy) { this.state.ai.originStrategy = value }
    get originInterval(): number { return this.state.ai.originInterval }
    set originInterval(value: number) { this.state.ai.originInterval = value }
    get chaseLeashRadius(): number { return this.state.ai.chaseLeashRadius }
    set chaseLeashRadius(value: number) { this.state.ai.chaseLeashRadius = value }
    get aiBlockDuration(): number { return this.state.ai.aiBlockDuration }
    set aiBlockDuration(value: number) { this.state.ai.aiBlockDuration = value }
    get aiBlockCooldown(): number { return this.state.ai.aiBlockCooldown }
    set aiBlockCooldown(value: number) { this.state.ai.aiBlockCooldown = value }

    get isDying(): boolean { return this.state.timers.isDying }
    set isDying(value: boolean) { this.state.timers.isDying = value }
    get dyingTimer(): number { return this.state.timers.dyingTimer }
    set dyingTimer(value: number) { this.state.timers.dyingTimer = value }
    get dyingFallDirX(): number { return this.state.timers.dyingFallDirX }
    set dyingFallDirX(value: number) { this.state.timers.dyingFallDirX = value }
    get dyingFallDirZ(): number { return this.state.timers.dyingFallDirZ }
    set dyingFallDirZ(value: number) { this.state.timers.dyingFallDirZ = value }
    get dyingFallAngle(): number { return this.state.timers.dyingFallAngle }
    set dyingFallAngle(value: number) { this.state.timers.dyingFallAngle = value }
    get knockdownFallDirX(): number { return this.state.timers.knockdownFallDirX }
    set knockdownFallDirX(value: number) { this.state.timers.knockdownFallDirX = value }
    get knockdownFallDirZ(): number { return this.state.timers.knockdownFallDirZ }
    set knockdownFallDirZ(value: number) { this.state.timers.knockdownFallDirZ = value }
    get knockdownFallAngle(): number { return this.state.timers.knockdownFallAngle }
    set knockdownFallAngle(value: number) { this.state.timers.knockdownFallAngle = value }

    get interactTargetActive(): boolean | undefined { return this.state.interaction.active }
    set interactTargetActive(value: boolean | undefined) { this.state.interaction.active = value ?? false }
    get interactTargetX(): number | undefined { return this.state.interaction.targetX }
    set interactTargetX(value: number | undefined) { this.state.interaction.targetX = value ?? 0 }
    get interactTargetZ(): number | undefined { return this.state.interaction.targetZ }
    set interactTargetZ(value: number | undefined) { this.state.interaction.targetZ = value ?? 0 }
}

export type {CharacterStateInit}

/** 由生成参数构造唯一权威 state；物理/交互/动画初值集中在此，避免散落默认值 */
export const createCharacterState = (init: CharacterStateInit): CharacterState => ({
    identity: {
        id: init.id,
        isPlayer: init.isPlayer,
        rowText: init.rowText ?? '',
    },
    config: init.config,
    bodyState: init.bodyState,
    combat: init.combat,
    stateMachine: init.stateMachine,
    physics: {
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        groundBodyHandle: null,
        airborneTime: 0,
        groundedTime: 0,
        ...init.physics,
    },
    ai: init.ai,
    timers: {
        isDying: false,
        dyingTimer: 0,
        dyingFallDirX: 0,
        dyingFallDirZ: 0,
        dyingFallAngle: 0,
        knockdownFallDirX: 0,
        knockdownFallDirZ: 0,
        knockdownFallAngle: 0,
    },
    interaction: {active: false, targetX: 0, targetZ: 0},
    environment: init.environment,
    lockPoints: init.lockPoints ?? [],
    ...(init.hurtProfile !== undefined ? {hurtProfile: init.hurtProfile} : {}),
    ...(init.hurtBlocks !== undefined ? {hurtBlocks: init.hurtBlocks} : {}),
    animation: {
        params: {
            horizontalSpeed: 0,
            verticalSpeed: 0,
            turnRate: 0,
            aimDirection: {x: 0, y: 0, z: 1},
            facingYaw: 0,
            attackCharge: 0,
            attackTotalProgress: 0,
            stateProgress: 0,
        },
        current: {graphId: null, rootProgress: 0, layerWeights: {}},
    },
})
