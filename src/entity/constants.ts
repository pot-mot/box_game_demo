/** 角色实体类型标识（单一来源，避免字符串漂移） */
export const CHARACTER_ENTITY_TYPE = 'character' as const

/** 实体类型枚举值列表 */
const ENTITY_TYPE_VALUES = [
    'box/common', 'box/destruction', 'box/burning', 'box/magnet', 'box/elasticity',
    'fragment/common',
    'area/water',
    CHARACTER_ENTITY_TYPE,
    'terrain',
] as const
type EntityType = typeof ENTITY_TYPE_VALUES[number]

export {ENTITY_TYPE_VALUES}
export type {EntityType}
