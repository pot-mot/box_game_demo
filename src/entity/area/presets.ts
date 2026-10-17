import type {AreaConfig, AreaShape} from './types/index.ts'
import type {AreaPresetId} from '../../types/areaPreset.ts'
import {FLOAT_DEFAULTS, WIND_DEFAULTS, GRAVITY_DEFAULTS} from './physics/constants.ts'

/** 预设决定的「材质 + 场」配置片段（几何尺寸由调用方提供） */
export type AreaPresetSpec = Pick<AreaConfig, 'material' | 'fields'>

/** 各预设的视觉材质 + 物理场组合（新对象字面量，避免共享默认表被就地修改） */
export const AREA_PRESETS: Record<AreaPresetId, AreaPresetSpec> = {
    water: {material: 'water', fields: {float: {...FLOAT_DEFAULTS}}},
    air: {material: 'air', fields: {wind: {...WIND_DEFAULTS}}},
    force_field: {material: 'force_field', fields: {gravity: {...GRAVITY_DEFAULTS}}},
}

/** 按预设组装完整区域配置（几何由调用方给定） */
export const areaPresetConfig = (preset: AreaPresetId, shape: AreaShape): AreaConfig => ({
    shape,
    ...AREA_PRESETS[preset],
})
