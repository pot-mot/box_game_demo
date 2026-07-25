/** 实体类型枚举值列表 */
const ENTITY_TYPE_VALUES = [
    'box/common', 'box/destruction', 'box/burning', 'box/magnet', 'box/elasticity',
    'fragment/common',
    'area/water',
    'terrain/fbm', 'terrain/flat', 'terrain/sine', 'terrain/steps',
] as const
type EntityType = typeof ENTITY_TYPE_VALUES[number]

export {ENTITY_TYPE_VALUES}
export type {EntityType}
