import {SURFACE_MATERIAL_IDS, type SurfaceMaterialId} from '../../../render/materials/index.ts'
import {BUILDING_PROP_KINDS, type BuildingPropKind} from '../props/kinds.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'
import {localizeApply} from '../../../i18n/dom.ts'

/** 基础表面材质本地化名键 */
export const MATERIAL_LABELS: Record<SurfaceMaterialId, StringLocaleKey> = {
    rock: 'material.rock',
    soil: 'material.soil',
    brick: 'material.brick',
    wood: 'material.wood',
    rusty_iron: 'material.rusty_iron',
    tile: 'material.tile',
    cloth: 'material.cloth',
}

/** 自由道具本地化名键 */
export const PROP_LABELS: Record<BuildingPropKind, StringLocaleKey> = {
    door: 'prop.door',
    window: 'prop.window',
    fence: 'prop.fence',
    lantern: 'prop.lantern',
}

/** 建筑配方本地化名键（按配方 id；未知配方回退原 id） */
export const RECIPE_LABELS: Record<string, StringLocaleKey> = {
    house: 'recipe.house',
    tower: 'recipe.tower',
    wall: 'recipe.wall',
    platform: 'recipe.platform',
    ruin: 'recipe.ruin',
    tree: 'recipe.tree',
    stairs: 'recipe.stairs',
    spiral_stairs: 'recipe.spiral_stairs',
    bridge: 'recipe.bridge',
    great_hall: 'recipe.great_hall',
    keep: 'recipe.keep',
    dungeon: 'recipe.dungeon',
}

/** 配方 id → 本地化显示名（未知配方回退原 id） */
export const recipeLabel = (id: string): string => {
    const key = RECIPE_LABELS[id]
    return key === undefined ? id : translate(key)
}

/** 在只读字符串列表中找到匹配值（避免不安全类型断言） */
export const findIn = <T extends string>(list: readonly T[], value: string): T | undefined =>
    list.find(item => item === value)

export interface SelectOption {
    value: string
    /** 静态标签文本（不随语言变化时使用，如 `0°`）；提供 `render` 时忽略 */
    label?: string
    /** 动态标签：随语言切换重新计算（用于本地化文案） */
    render?: () => string
}

/** 创建下拉选择框（`render` 选项登记为计算型本地化，语言切换时自动重译） */
export const createSelect = (options: readonly SelectOption[], current: string): HTMLSelectElement => {
    const select = document.createElement('select')
    select.className = 'dc-select'
    for (const option of options) {
        const opt = document.createElement('option')
        opt.value = option.value
        const render = option.render
        if (render !== undefined) {
            localizeApply(opt, el => { el.textContent = render() })
        } else {
            opt.textContent = option.label ?? option.value
        }
        select.appendChild(opt)
    }
    select.value = current
    return select
}

/** 材质下拉选项 */
export const materialOptions = (): SelectOption[] =>
    SURFACE_MATERIAL_IDS.map(id => ({value: id, label: translate(MATERIAL_LABELS[id]), render: () => translate(MATERIAL_LABELS[id])}))

/** 道具下拉选项 */
export const propOptions = (): SelectOption[] =>
    BUILDING_PROP_KINDS.map(kind => ({value: kind, label: translate(PROP_LABELS[kind]), render: () => translate(PROP_LABELS[kind])}))

/** 配方下拉选项 */
export const recipeOptions = (ids: readonly string[]): SelectOption[] =>
    ids.map(id => ({value: id, label: recipeLabel(id), render: () => recipeLabel(id)}))
