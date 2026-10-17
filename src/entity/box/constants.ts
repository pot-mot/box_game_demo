import {DEFAULT_SURFACE_MATERIAL} from '../../render/materials/ids.ts'
import type {SurfaceMaterialId} from '../../render/materials/ids.ts'

/**
 * 箱子可选特性标识：配置对象 `BoxConfig` 中存在对应的键即视为启用该特性
 * （`elastic` / `magnet` / `destructible` / `burning`）。
 */
const BOX_TRAIT_IDS = ['destructible', 'burning', 'magnet', 'elastic'] as const
type BoxTraitId = typeof BOX_TRAIT_IDS[number]

/** 默认表面材质（复用共享表面材质库） */
const DEFAULT_BOX_MATERIAL: SurfaceMaterialId = DEFAULT_SURFACE_MATERIAL

/** 无特性箱子的默认徽章 */
const BOX_DEFAULT_BADGE_LABEL = 'C'
const BOX_DEFAULT_BADGE_COLOR = '#448'

/** 特性徽章字母（按 `BOX_TRAIT_IDS` 顺序取首个启用的特性作为主色） */
const BOX_BADGE_LABELS: Record<BoxTraitId, string> = {
    destructible: 'D',
    burning: 'B',
    magnet: 'M',
    elastic: 'E',
}

/** 特性徽章底色（来自实体数据，非主题色） */
const BOX_BADGE_COLORS: Record<BoxTraitId, string> = {
    destructible: '#844',
    burning: '#f44',
    magnet: '#96c',
    elastic: '#6b8',
}

/** 由启用特性集合派生徽章字母与底色（无特性回退默认「C」） */
const badgeOf = (traits: readonly BoxTraitId[]): {label: string; color: string} => {
    if (traits.length === 0) return {label: BOX_DEFAULT_BADGE_LABEL, color: BOX_DEFAULT_BADGE_COLOR}
    const label = traits.map(t => BOX_BADGE_LABELS[t]).join('')
    return {label, color: BOX_BADGE_COLORS[traits[0]]}
}

export {
    BOX_TRAIT_IDS,
    DEFAULT_BOX_MATERIAL,
    BOX_DEFAULT_BADGE_LABEL,
    BOX_DEFAULT_BADGE_COLOR,
    BOX_BADGE_LABELS,
    BOX_BADGE_COLORS,
    badgeOf,
}
export type {BoxTraitId}
