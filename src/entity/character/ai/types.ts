import type {CharacterEntity} from '../../../character/types.ts'
import type {AIStrategy, AIStrategyConfig} from '../../../character/ai_strategy.ts'
import type {LineOfSightChecker} from './line_of_sight.ts'

export type {AIStrategy, AIStrategyConfig} from '../../../character/ai_strategy.ts'

export const AI_STATES = ['patrol', 'chase', 'approach', 'volley', 'kite', 'attack', 'flee'] as const
export type AIState = typeof AI_STATES[number]

export interface AIContext {
    characterId: number
    spawnPoint: {x: number; y: number; z: number}
    patrolRadius: number
    waypoint: {x: number; y: number; z: number}
    currentState: AIState
    stateTime: number
    waitTimer: number
    targetId: number | undefined
    strafeDir: number
    strafeTimer: number
    losChecker: LineOfSightChecker | null
    /** AI 策略 */
    strategy: AIStrategy
    /** 策略配置 */
    strategyConfig: AIStrategyConfig
    /** 逃跑方向（cowardly flee 状态使用） */
    fleeDir: {x: number; z: number}
    /** 当前逃跑周期内的还击次数（cowardly 专用） */
    burstAttackCount: number
}

export interface AITransition {
    to: AIState
    guard: (ctx: AIContext, character: CharacterEntity, allCharacters: readonly CharacterEntity[]) => boolean
}

export interface AIStateHandler {
    enter: (ctx: AIContext, character: CharacterEntity) => void
    update: (dt: number, ctx: AIContext, character: CharacterEntity, allCharacters: readonly CharacterEntity[], setInput: (dx: number, dz: number, attack: boolean) => void) => void
    exit: (ctx: AIContext, character: CharacterEntity) => void
    transitions: readonly AITransition[]
}
