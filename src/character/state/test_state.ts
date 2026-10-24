import {createBodyEnvironment} from '../../physics/environment.ts'
import type {CombatComponent} from '../combat/types.ts'
import type {CharacterConfig, CharacterState} from './types.ts'
import {createCharacterStateMachineData, type CharacterStateMachineData} from './types.ts'

/** 测试专用：构造最小 CharacterState；生产代码必须走 `createCharacterState` */
export interface TestCharacterStateOptions {
    readonly id?: number
    readonly combat?: CombatComponent
    readonly stateMachine?: CharacterStateMachineData
    readonly config?: CharacterConfig
    readonly bodyState?: Readonly<Record<string, string>>
    readonly rowText?: string
    readonly isPlayer?: boolean
}

export const createTestCharacterState = (options: TestCharacterStateOptions): CharacterState => ({
    identity: {id: options.id ?? 1, isPlayer: options.isPlayer ?? false, rowText: options.rowText ?? ''},
    config: options.config ?? {speed: 6, jumpHeight: 2, scale: 1},
    bodyState: options.bodyState ?? {},
    combat: options.combat ?? (undefined as unknown as CombatComponent),
    stateMachine: options.stateMachine ?? createCharacterStateMachineData(),
    physics: {
        isOnGround: true,
        groundNormal: {x: 0, y: 1, z: 0},
        groundKeepTimer: 0,
        groundBodyHandle: null,
        airborneTime: 0,
        groundedTime: 0,
    },
    ai: {
        navEnabled: true,
        peaceStrategy: 'patrol',
        combatStrategy: 'tactical',
        originStrategy: 'resident',
        originInterval: 20,
        chaseLeashRadius: 20,
        aiBlockDuration: 0.4,
        aiBlockCooldown: 1.2,
    },
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
    environment: createBodyEnvironment(),
    lockPoints: [],
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
