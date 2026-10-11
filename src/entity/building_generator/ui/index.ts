import type {PanelContext} from '../../box/base/ui'
import type {BuildingGeneratorContext, BuildingWorld} from '../types'
import {SURFACE_MATERIAL_IDS} from '../../../render/materials/index.ts'
import {BUILDING_RECIPE_IDS} from '../generators/structures.ts'
import {DEFAULT_BUILDING_CONFIG} from '../validation.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createSection} from '../../../ui/components/section.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import {createEntityPanel} from '../../../ui/components/entity_panel.ts'
import {localizeText, appendLocalizedText} from '../../../i18n/dom.ts'
import {createIcon} from '../../../ui/icons/icon.ts'
import {translate} from '../../../i18n/index.ts'
import {createSelect, findIn, materialOptions, recipeOptions, PROP_LABELS} from './labels.ts'

export const formatRowText = (world: BuildingWorld): string =>
    `#${world.id}  ${world.config.recipe}  seed:${world.config.seed}  chunks:${world.chunks.size}`

const YAW_OPTIONS = [0, 1, 2, 3].map(q => ({value: String(q), label: `${q * 90}°`}))

export const createBuildingPanel = (ctx: Omit<BuildingGeneratorContext, 'panel'>): PanelContext => {
    const el = createEntityPanel('building-generator-panel', 'entity.building_generator')
    el.style.cssText += ';min-width:250px'

    el.appendChild(createSection('panel.recipe'))
    const recipeRow = document.createElement('label')
    recipeRow.className = 'dc-label'
    appendLocalizedText(recipeRow, 'panel.recipe')
    recipeRow.appendChild(document.createTextNode(' '))
    const recipe = createSelect(
        recipeOptions(BUILDING_RECIPE_IDS),
        DEFAULT_BUILDING_CONFIG.recipe,
    )
    recipe.id = 'building-recipe'
    recipeRow.appendChild(recipe)
    el.appendChild(recipeRow)

    const seed = createLabeledNumberInput(el, 'panel.seed', {step: '1', value: String(DEFAULT_BUILDING_CONFIG.seed)})

    el.appendChild(createSection('panel.size_voxel'))
    const sizeX = createLabeledNumberInput(el, 'panel.x', {min: '1', max: '64', step: '1', value: String(DEFAULT_BUILDING_CONFIG.sizeX)})
    const sizeY = createLabeledNumberInput(el, 'panel.y', {min: '1', max: '64', step: '1', value: String(DEFAULT_BUILDING_CONFIG.sizeY)})
    const sizeZ = createLabeledNumberInput(el, 'panel.z', {min: '1', max: '64', step: '1', value: String(DEFAULT_BUILDING_CONFIG.sizeZ)})

    el.appendChild(createSection('panel.position'))
    const posX = createLabeledNumberInput(el, 'panel.x', {step: '0.5', value: '0'})
    const posY = createLabeledNumberInput(el, 'panel.y', {step: '0.5', value: '0'})
    const posZ = createLabeledNumberInput(el, 'panel.z', {step: '0.5', value: '0'})

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    /* ── 自由道具列表（编辑 / 删除）── */
    el.appendChild(createSection('panel.props'))
    const propList = document.createElement('div')
    propList.className = 'dc-list'
    el.appendChild(propList)
    const propEmpty = document.createElement('div')
    propEmpty.className = 'dc-list-empty'
    localizeText(propEmpty, 'entity.no_props')
    propList.appendChild(propEmpty)

    /* ── 全建筑材质替换 ── */
    el.appendChild(createSection('panel.material_replace'))
    const replaceFrom = createSelect(materialOptions(), 'brick')
    replaceFrom.id = 'building-replace-from'
    const replaceTo = createSelect(materialOptions(), 'wood')
    replaceTo.id = 'building-replace-to'
    const replaceRow = document.createElement('div')
    replaceRow.className = 'dc-row'
    replaceRow.style.cssText = 'gap:6px;margin-top:2px'
    replaceFrom.style.flex = '1'
    replaceTo.style.flex = '1'
    const replaceBtn = document.createElement('button')
    replaceBtn.className = 'dc-btn'
    localizeText(replaceBtn, 'entity.replace')
    replaceRow.appendChild(replaceFrom)
    replaceRow.appendChild(document.createTextNode('→'))
    replaceRow.appendChild(replaceTo)
    replaceRow.appendChild(replaceBtn)
    el.appendChild(replaceRow)

    /** 应用：对选中世界设置位置，并在配方 / 种子 / 尺寸变化时重建体素 */
    const apply = (): void => {
        const sel = ctx.getSelected()
        if (!sel) return
        ctx.setTransform(
            sel.id,
            {x: parseFloat(posX.value) || 0, y: parseFloat(posY.value) || 0, z: parseFloat(posZ.value) || 0},
            {x: 0, y: sel.yawQuarter * 90, z: 0},
        )
        const config = {
            recipe: recipe.value,
            seed: Math.trunc(parseFloat(seed.value) || 0),
            sizeX: Math.trunc(parseFloat(sizeX.value) || 1),
            sizeY: Math.trunc(parseFloat(sizeY.value) || 1),
            sizeZ: Math.trunc(parseFloat(sizeZ.value) || 1),
        }
        const previous = sel.config
        const changed = config.recipe !== previous.recipe
            || config.seed !== previous.seed
            || config.sizeX !== previous.sizeX
            || config.sizeY !== previous.sizeY
            || config.sizeZ !== previous.sizeZ
        if (changed) ctx.updateConfig(sel.id, config)
    }
    applyBtn.onclick = apply
    deleteBtn.onclick = () => {
        const sel = ctx.getSelected()
        if (sel) ctx.remove(sel.id)
    }
    replaceBtn.onclick = () => {
        const sel = ctx.getSelected()
        const from = findIn(SURFACE_MATERIAL_IDS, replaceFrom.value)
        const to = findIn(SURFACE_MATERIAL_IDS, replaceTo.value)
        if (sel && from !== undefined && to !== undefined) ctx.replaceMaterial(sel.id, from, to)
    }

    const refreshValues = (): void => {
        /* 输入框聚焦中不刷新，避免覆盖用户输入 */
        if (el.contains(document.activeElement)) return
        const sel = ctx.getSelected()
        if (!sel) return
        recipe.value = sel.config.recipe
        seed.value = String(sel.config.seed)
        sizeX.value = String(sel.config.sizeX)
        sizeY.value = String(sel.config.sizeY)
        sizeZ.value = String(sel.config.sizeZ)
        posX.value = sel.group.position.x.toFixed(2)
        posY.value = sel.group.position.y.toFixed(2)
        posZ.value = sel.group.position.z.toFixed(2)
    }

    let propSignature = ''
    const rebuildPropList = (world: BuildingWorld | undefined): void => {
        propList.replaceChildren()
        if (!world || world.props.length === 0) {
            propList.appendChild(propEmpty)
            propEmpty.style.display = ''
            return
        }
        propEmpty.style.display = 'none'
        world.props.forEach((prop, index) => {
            const row = document.createElement('div')
            row.className = 'dc-row'
            const label = document.createElement('span')
            label.className = 'dc-list-info'
            label.textContent = `#${index} ${translate(PROP_LABELS[prop.kind])} (${prop.position[0].toFixed(1)},${prop.position[1].toFixed(1)},${prop.position[2].toFixed(1)})`
            row.appendChild(label)

            const materialSelect = createSelect(materialOptions(), prop.material)
            materialSelect.style.maxWidth = '70px'
            materialSelect.addEventListener('change', () => {
                const matched = findIn(SURFACE_MATERIAL_IDS, materialSelect.value)
                if (matched !== undefined) ctx.updateProp(world.id, index, {material: matched})
            })
            row.appendChild(materialSelect)

            const yawSelect = createSelect(YAW_OPTIONS, String(prop.yawQuarter))
            yawSelect.style.maxWidth = '60px'
            yawSelect.addEventListener('change', () => {
                const q = Math.trunc(parseFloat(yawSelect.value)) || 0
                ctx.updateProp(world.id, index, {yawQuarter: ((q % 4) + 4) % 4})
            })
            row.appendChild(yawSelect)

            const del = document.createElement('button')
            del.className = 'dc-list-del'
            del.appendChild(createIcon('close', {size: 'sm'}))
            del.addEventListener('click', () => ctx.removeProp(world.id, index))
            row.appendChild(del)

            propList.appendChild(row)
        })
    }

    return {
        render: (container: HTMLElement) => {
            container.appendChild(el)
            el.style.display = 'block'
            refreshValues()
            propSignature = ''
        },
        destroy: () => {
            el.remove()
        },
        update: () => {
            refreshValues()
            const sel = ctx.getSelected()
            const signature = sel ? `${sel.id}:${sel.props.length}` : ''
            if (signature !== propSignature) {
                propSignature = signature
                rebuildPropList(sel)
            }
        },
    }
}
