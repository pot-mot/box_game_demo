import type {CharacterEntity} from '../types.ts'

export const CHARACTER_STATES = ['idle', 'walking', 'jumping', 'falling', 'attacking', 'dying'] as const
export type CharacterState = typeof CHARACTER_STATES[number]

export interface CharacterInput {
    dx: number
    dz: number
    jump: boolean
    attack: boolean
    skillIndex: number
    sprint: boolean
}

export interface MachineContext {
    readonly stateTime: number
    readonly previousState: CharacterState | null
}

export interface Transition {
    to: CharacterState
    guard: (input: CharacterInput, entity: CharacterEntity) => boolean
}

export interface StateHandler {
    enter: (entity: CharacterEntity, ctx: MachineContext) => void
    update: (dt: number, input: CharacterInput, entity: CharacterEntity, ctx: MachineContext) => void
    exit: (entity: CharacterEntity, ctx: MachineContext) => void
    transitions: readonly Transition[]
}

export interface CharacterStateMachine {
    readonly currentState: CharacterState
    readonly previousState: CharacterState | null
    readonly stateTime: number
    onStateChange: ((from: CharacterState, to: CharacterState) => void) | null

    setInput(dx: number, dz: number, jump: boolean, attack: boolean, sprint?: boolean, skillIndex?: number): void
    update(dt: number, entity: CharacterEntity): void
    reset(): void
}
