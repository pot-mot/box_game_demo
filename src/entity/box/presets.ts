import type {BoxConfig} from './types/index.ts'
import type {BoxPresetId} from '../../types/boxPreset.ts'
import {DEFAULT_BOX_CONFIG} from './validation.ts'
import {DESTRUCTIBLE_DEFAULTS, BURNING_DEFAULTS, MAGNET_DEFAULTS, ELASTIC_DEFAULTS} from './physics/constants.ts'

/** 预设决定的特性配置片段（尺寸 / 质量 / 摩擦等由调用方提供） */
export type BoxTraitConfig = Pick<BoxConfig, 'destructible' | 'burning' | 'magnet' | 'elastic'>

/** 各预设启用的特性组合（新对象字面量，避免共享默认表被就地修改） */
export const BOX_PRESETS: Record<BoxPresetId, BoxTraitConfig> = {
    common: {},
    destructible: {destructible: {...DESTRUCTIBLE_DEFAULTS}},
    burning: {burning: {...BURNING_DEFAULTS}},
    magnet: {magnet: {...MAGNET_DEFAULTS}},
    elastic: {elastic: {...ELASTIC_DEFAULTS}},
}

/** 预设以外的刚体基础配置（尺寸 / 质量 / 摩擦） */
export type BoxPresetBody = Pick<BoxConfig, 'width' | 'height' | 'depth' | 'mass' | 'friction'>

/** 按预设组装完整箱子配置（缺失字段取默认值） */
export const boxPresetConfig = (preset: BoxPresetId, body: BoxPresetBody): BoxConfig => ({
    ...DEFAULT_BOX_CONFIG,
    ...body,
    ...BOX_PRESETS[preset],
})
