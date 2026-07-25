const AREA_TYPE_VALUES = ['area/water'] as const
type AreaType = typeof AREA_TYPE_VALUES[number]

export {AREA_TYPE_VALUES}
export type {AreaType}
