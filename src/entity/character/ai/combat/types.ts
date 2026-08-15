import type {CharacterEntity} from '../../../../character/types.ts'
import type {CombatSubStrategy, CombatConfig} from '../../../../character/ai_strategy/combat.ts'
import type {AISetInput} from '../types.ts'

export type {CombatSubStrategy, CombatConfig}

export const COMBAT_STATES = ['chase', 'approach', 'volley', 'kite', 'attack', 'flee', 'inactive'] as const
export type CombatState = typeof COMBAT_STATES[number]

export interface CombatTransition {
    to: CombatState
    guard: (ctx: import('../types.ts').AIContext, character: CharacterEntity, allCharacters: readonly CharacterEntity[]) => boolean
}

export interface CombatStateHandler {
    enter: (ctx: import('../types.ts').AIContext, character: CharacterEntity) => void
    update: (dt: number, ctx: import('../types.ts').AIContext, character: CharacterEntity, allCharacters: readonly CharacterEntity[], setInput: AISetInput) => void
    exit: (ctx: import('../types.ts').AIContext, character: CharacterEntity) => void
    transitions: readonly CombatTransition[]
}
