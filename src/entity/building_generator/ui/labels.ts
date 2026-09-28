import {SURFACE_MATERIAL_IDS, type SurfaceMaterialId} from '../../../render/materials/index.ts'
import {BUILDING_PROP_KINDS, type BuildingPropKind} from '../props/kinds.ts'

/** 基础表面材质中文名 */
export const MATERIAL_LABELS: Record<SurfaceMaterialId, string> = {
    rock: '岩石',
    soil: '泥土',
    brick: '砖石',
    wood: '木材',
    rusty_iron: '锈铁',
    tile: '瓷砖',
    cloth: '布料',
}

/** 自由道具中文名 */
export const PROP_LABELS: Record<BuildingPropKind, string> = {
    door: '门',
    window: '窗',
    fence: '栅栏',
    lantern: '灯笼',
}

/** 在只读字符串列表中找到匹配值（避免不安全类型断言） */
export const findIn = <T extends string>(list: readonly T[], value: string): T | undefined =>
    list.find(item => item === value)

export interface SelectOption {
    value: string
    label: string
}

/** 创建下拉选择框 */
export const createSelect = (options: readonly SelectOption[], current: string): HTMLSelectElement => {
    const select = document.createElement('select')
    for (const option of options) {
        const opt = document.createElement('option')
        opt.value = option.value
        opt.textContent = option.label
        select.appendChild(opt)
    }
    select.value = current
    return select
}

/** 材质下拉选项 */
export const materialOptions = (): SelectOption[] =>
    SURFACE_MATERIAL_IDS.map(id => ({value: id, label: MATERIAL_LABELS[id]}))

/** 道具下拉选项 */
export const propOptions = (): SelectOption[] =>
    BUILDING_PROP_KINDS.map(kind => ({value: kind, label: PROP_LABELS[kind]}))
