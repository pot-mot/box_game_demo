const ENTITY_TYPE_VALUES = ['common', 'destruction', 'water'] as const
type EntityType = typeof ENTITY_TYPE_VALUES[number]

export {ENTITY_TYPE_VALUES}
export type {EntityType}
