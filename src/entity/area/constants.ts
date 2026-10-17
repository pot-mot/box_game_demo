/**
 * 区域（area）枚举与派生工具。
 *
 * 设计：单一实体类型 `area`，`config` 携带
 *  - `shape`    —— 体积几何（box / sphere / cylinder）
 *  - `material` —— 视觉材质（water / air / force_field），与物理无关
 *  - `fields`   —— 物理场（float / wind / gravity），存在键即启用，可任意组合
 * 视觉与物理完全解耦：水色场地也能配重力场，反之亦然。
 */

/** 物理场标识（存在 `config.fields[id]` 即启用该场） */
const AREA_FIELD_IDS = ['float', 'wind', 'gravity'] as const
type AreaFieldId = typeof AREA_FIELD_IDS[number]

/** 视觉材质标识（体积视觉特效，与物理场无关） */
const AREA_MATERIAL_IDS = ['water', 'air', 'force_field'] as const
type AreaMaterialId = typeof AREA_MATERIAL_IDS[number]

/** 未指定时的默认视觉材质 */
const DEFAULT_AREA_MATERIAL: AreaMaterialId = 'water'

/** 体积几何种类 */
const AREA_SHAPE_KINDS = ['box', 'sphere', 'cylinder'] as const
type AreaShapeKind = typeof AREA_SHAPE_KINDS[number]

/** 无场区域的默认徽章 */
const AREA_DEFAULT_BADGE_LABEL = 'A'
const AREA_DEFAULT_BADGE_COLOR = '#557'

/** 场徽章字母（按 `AREA_FIELD_IDS` 顺序） */
const AREA_FIELD_BADGE_LABELS: Record<AreaFieldId, string> = {
    float: 'F',
    wind: 'W',
    gravity: 'G',
}

/** 场徽章底色（来自实体数据，非主题色） */
const AREA_FIELD_BADGE_COLORS: Record<AreaFieldId, string> = {
    float: '#1f6f8b',
    wind: '#5f8b1f',
    gravity: '#7a3fbf',
}

/** 由启用场集合派生徽章字母与底色（无场回退默认「A」） */
const badgeOf = (fields: {readonly [K in AreaFieldId]?: unknown}): {label: string; color: string} => {
    const enabled = AREA_FIELD_IDS.filter(id => fields[id] !== undefined)
    if (enabled.length === 0) return {label: AREA_DEFAULT_BADGE_LABEL, color: AREA_DEFAULT_BADGE_COLOR}
    return {
        label: enabled.map(id => AREA_FIELD_BADGE_LABELS[id]).join(''),
        color: AREA_FIELD_BADGE_COLORS[enabled[0]],
    }
}

/** 当前启用的场标识（按 `AREA_FIELD_IDS` 顺序） */
const enabledFields = (fields: {readonly [K in AreaFieldId]?: unknown}): AreaFieldId[] =>
    AREA_FIELD_IDS.filter(id => fields[id] !== undefined)

export type {AreaFieldId, AreaMaterialId, AreaShapeKind}
export {
    AREA_FIELD_IDS,
    AREA_MATERIAL_IDS,
    DEFAULT_AREA_MATERIAL,
    AREA_SHAPE_KINDS,
    AREA_FIELD_BADGE_LABELS,
    AREA_FIELD_BADGE_COLORS,
    badgeOf,
    enabledFields,
}
