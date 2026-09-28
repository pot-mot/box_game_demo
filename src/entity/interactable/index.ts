export {setupInteractables, breakableRollDamage} from './physics/world.ts'
export {INTERACTABLE_KINDS, INTERACTABLE_LABELS, BREAKABLE_SOURCES, BREAKABLE_SOURCE_LABELS, isInteractableKind} from './kinds.ts'
export type {InteractableKind, BreakableSource} from './kinds.ts'
export {defaultInteractableConfig} from './constants.ts'
export type {
    InteractableConfig,
    InteractableEntity,
    InteractableContext,
    InteractableHooks,
    InteractablePlayerAccess,
    InteractableSaveEntry,
} from './types.ts'
