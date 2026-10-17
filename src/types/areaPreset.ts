/**
 * 区域预设标识（中立定义）。
 *
 * 放在通用类型层而非 `entity/area`，避免 `inventory/` 等下层模块
 * 反向依赖实体层造成循环依赖；具体「预设 → 材质 + 场配置」映射由 `entity/area/presets.ts` 提供。
 */
export const AREA_PRESET_IDS = ['water', 'air', 'force_field'] as const
export type AreaPresetId = typeof AREA_PRESET_IDS[number]

/** 运行时校验：字符串是否为合法预设标识 */
export const isAreaPresetId = (value: string): value is AreaPresetId =>
    (AREA_PRESET_IDS as readonly string[]).includes(value)
