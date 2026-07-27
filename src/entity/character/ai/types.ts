import type {CharacterEntity} from '../../../character/types.ts'

export const AI_STATES = ['patrol', 'chase', 'attack'] as const
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
