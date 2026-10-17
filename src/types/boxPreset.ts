/**
 * 箱子特性预设标识（中立定义）。
 *
 * 放在通用类型层而非 `entity/box`，避免 `inventory/`、`character/`（AI 建造）等下层模块
 * 反向依赖实体层造成循环依赖；具体「预设 → 特性配置」映射由 `entity/box/presets.ts` 提供。
 */
export const BOX_PRESET_IDS = ['common', 'destructible', 'burning', 'magnet', 'elastic'] as const
export type BoxPresetId = typeof BOX_PRESET_IDS[number]

/** 运行时校验：字符串是否为合法预设标识 */
export const isBoxPresetId = (value: string): value is BoxPresetId =>
    (BOX_PRESET_IDS as readonly string[]).includes(value)
