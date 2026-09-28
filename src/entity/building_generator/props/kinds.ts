/** 自由道具种类（非体素装饰件：门窗 / 栅栏 / 灯笼等） */
const BUILDING_PROP_KINDS = ['door', 'window', 'fence', 'lantern'] as const
type BuildingPropKind = typeof BUILDING_PROP_KINDS[number]

export {BUILDING_PROP_KINDS}
export type {BuildingPropKind}
