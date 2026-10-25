import type {Group, LineSegments, Mesh} from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type {CharacterEntity, CharacterState} from '../../character/types.ts'
import type {CharacterStateInit} from '../../character/state/types.ts'
import type {CharacterStateMachine} from '../../character/state_machine/types.ts'
import {createStaminaState} from '../../character/stamina/runtime.ts'

/** 引擎句柄：只存运行时对象，不进入 CharacterState */
export interface CharacterRuntimeHandles {
    readonly body: RAPIER.RigidBody
    readonly mainCollider: RAPIER.Collider
    readonly colliders: RAPIER.Collider[]
    readonly mesh: Mesh
    readonly wireframe: LineSegments | undefined
    readonly appearanceGroup: Group
}

/** 生产角色运行时：`state` 是唯一游戏数据存储，其余字段只放引擎句柄与状态机逻辑对象。 */
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
    stamina: createStaminaState(init.config, init.combat, init.config.bodyFormId ?? 'humanoid'),
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
