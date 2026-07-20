/** 实体类型枚举值列表 */
const ENTITY_TYPE_VALUES = ['box/common', 'box/destruction', 'box/water', 'box/burning', 'fragment/common'] as const
type EntityType = typeof ENTITY_TYPE_VALUES[number]

export {ENTITY_TYPE_VALUES}
export type {EntityType}
