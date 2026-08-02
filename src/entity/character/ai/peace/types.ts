import type {PeaceSubStrategy, PeaceConfig} from '../../../../character/ai_strategy/peace.ts'

export type {PeaceSubStrategy, PeaceConfig}

export const PEACE_STATES = ['patrol', 'build'] as const
export type PeaceState = typeof PEACE_STATES[number]

export interface PeaceTransition {
    to: PeaceState
    guard: (ctx: import('../types.ts').AIContext, character: import('../../../../character/types.ts').CharacterEntity) => boolean
}

export interface PeaceStateHandler {
    enter: (ctx: import('../types.ts').AIContext, character: import('../../../../character/types.ts').CharacterEntity) => void
    update: (dt: number, ctx: import('../types.ts').AIContext, character: import('../../../../character/types.ts').CharacterEntity, setInput: (dx: number, dz: number, attack: boolean) => void) => void
    exit: (ctx: import('../types.ts').AIContext, character: import('../../../../character/types.ts').CharacterEntity) => void
    transitions: readonly PeaceTransition[]
}
