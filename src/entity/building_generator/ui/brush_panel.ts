import {SURFACE_MATERIAL_IDS} from '../../../render/materials/index.ts'
import {BUILDING_PROP_KINDS} from '../props/kinds.ts'
import {BUILDING_RECIPE_IDS} from '../generators/structures.ts'
import {DEFAULT_BUILDING_CONFIG} from '../validation.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createSelect, findIn, materialOptions, propOptions, recipeOptions} from './labels.ts'
import type {BuildingBrush, BuildingBrushTool} from '../edit/brush.ts'
import type {BuildingGeneratorContext} from '../types/index.ts'
import {localizeText, appendLocalizedText} from '../../../i18n/dom.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'

/** 面板只依赖建筑源的选中事件与当前选中 id */
type BuildingSelectionSource = Pick<BuildingGeneratorContext, 'events' | 'getSelectedId'>

const BRUSH_TOOLS = ['place', 'erase', 'prop', 'fill', 'replace', 'stamp'] as const

const TOOL_LABELS: Record<BuildingBrushTool, StringLocaleKey> = {
    place: 'entity.brush.place',
    erase: 'entity.brush.erase',
    prop: 'entity.brush.prop',
    fill: 'entity.brush.fill',
    replace: 'entity.brush.replace',
    stamp: 'entity.brush.stamp',
}

/**
 * 建造笔刷面板（编辑模式）：工具 / 材质 / 道具种类 / 预制体参数 + 启用开关。
 * 默认隐藏，仅当建筑源选中某个建筑（`select` 事件 id 非空）时显示；
 * 取消选中时隐藏并强制关闭笔刷（避免无 UI 可操作却仍拦截指针）。
 * 启用时通过 `onToggle` 通知编辑模式关闭实体选中 / 生成交互。
 */
export const setupBuildingBrushPanel = (
    brush: BuildingBrush,
    building: BuildingSelectionSource,
    onToggle: (enabled: boolean) => void,
): (() => void) => {
    const container = document.createElement('div')
    container.id = 'building-brush-panel'
    container.style.cssText = [
        'position: fixed; bottom: 24px; left: 16px;',
        'display: none;',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.6 monospace; padding: 10px 14px;',
        'border-radius: 8px; min-width: 200px;',
        'user-select: none;',
    ].join(' ')

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:6px'
    localizeText(header, 'entity.brush_title')
    container.appendChild(header)

    const toolRow = document.createElement('label')
    appendLocalizedText(toolRow, 'entity.brush_tool')
    toolRow.appendChild(document.createTextNode(' '))
    const toolSelect = createSelect(
        BRUSH_TOOLS.map(tool => ({value: tool, label: translate(TOOL_LABELS[tool]), render: () => translate(TOOL_LABELS[tool])})),
        brush.getTool(),
    )
    toolSelect.id = 'brush-tool'
    toolSelect.addEventListener('change', () => {
        const matched = findIn(BRUSH_TOOLS, toolSelect.value)
        if (matched !== undefined) {
            brush.setTool(matched)
            updateVisibility()
        }
    })
    toolRow.appendChild(toolSelect)
    container.appendChild(toolRow)

    const materialRow = document.createElement('label')
    appendLocalizedText(materialRow, 'entity.brush_material')
    materialRow.appendChild(document.createTextNode(' '))
    const materialSelect = createSelect(materialOptions(), brush.getMaterial())
    materialSelect.id = 'brush-material'
    materialSelect.addEventListener('change', () => {
        const matched = findIn(SURFACE_MATERIAL_IDS, materialSelect.value)
        if (matched !== undefined) brush.setMaterial(matched)
    })
    materialRow.appendChild(materialSelect)
    container.appendChild(materialRow)

    const propRow = document.createElement('label')
    appendLocalizedText(propRow, 'entity.brush_prop')
    propRow.appendChild(document.createTextNode(' '))
    const propSelect = createSelect(propOptions(), brush.getPropKind())
    propSelect.id = 'brush-prop'
    propSelect.addEventListener('change', () => {
        const matched = findIn(BUILDING_PROP_KINDS, propSelect.value)
        if (matched !== undefined) brush.setPropKind(matched)
    })
    propRow.appendChild(propSelect)
    container.appendChild(propRow)

    /* 预制体参数：配方 / 种子 / 尺寸 */
    const stampBox = document.createElement('div')
    stampBox.style.cssText = 'margin-top:4px'
    const recipeRow = document.createElement('label')
    appendLocalizedText(recipeRow, 'panel.recipe')
    recipeRow.appendChild(document.createTextNode(' '))
    const recipeSelect = createSelect(
        recipeOptions(BUILDING_RECIPE_IDS),
        brush.getStampConfig().recipe,
    )
    recipeSelect.id = 'brush-stamp-recipe'
    recipeRow.appendChild(recipeSelect)
    stampBox.appendChild(recipeRow)
    const seedInput = createLabeledNumberInput(stampBox, 'panel.seed', {step: '1', value: String(DEFAULT_BUILDING_CONFIG.seed)})
    const sizeXInput = createLabeledNumberInput(stampBox, 'panel.x', {min: '1', max: '64', step: '1', value: String(DEFAULT_BUILDING_CONFIG.sizeX)})
    const sizeYInput = createLabeledNumberInput(stampBox, 'panel.y', {min: '1', max: '64', step: '1', value: String(DEFAULT_BUILDING_CONFIG.sizeY)})
    const sizeZInput = createLabeledNumberInput(stampBox, 'panel.z', {min: '1', max: '64', step: '1', value: String(DEFAULT_BUILDING_CONFIG.sizeZ)})
    const syncStampConfig = (): void => {
        brush.setStampConfig({
            recipe: recipeSelect.value,
            seed: Math.trunc(parseFloat(seedInput.value) || 0),
            sizeX: Math.trunc(parseFloat(sizeXInput.value) || 1),
            sizeY: Math.trunc(parseFloat(sizeYInput.value) || 1),
            sizeZ: Math.trunc(parseFloat(sizeZInput.value) || 1),
        })
    }
    recipeSelect.addEventListener('change', syncStampConfig)
    for (const input of [seedInput, sizeXInput, sizeYInput, sizeZInput]) {
        input.addEventListener('change', syncStampConfig)
    }
    container.appendChild(stampBox)

    const enableRow = document.createElement('label')
    enableRow.style.cssText = 'display:block;margin-top:6px'
    const enableCheckbox = document.createElement('input')
    enableCheckbox.type = 'checkbox'
    enableCheckbox.id = 'brush-enable'
    enableRow.appendChild(enableCheckbox)
    const enableText = document.createElement('span')
    localizeText(enableText, 'entity.brush_enable')
    enableRow.appendChild(enableText)
    container.appendChild(enableRow)

    enableCheckbox.addEventListener('change', () => {
        brush.setEnabled(enableCheckbox.checked)
        onToggle(enableCheckbox.checked)
    })

    const updateVisibility = (): void => {
        const tool = brush.getTool()
        materialRow.style.display = (tool === 'erase' || tool === 'stamp') ? 'none' : ''
        propRow.style.display = tool === 'prop' ? '' : 'none'
        stampBox.style.display = tool === 'stamp' ? '' : 'none'
    }
    updateVisibility()

    /* 仅在选中建筑时显示；隐藏时强制关闭笔刷并恢复实体选中 */
    const setVisible = (visible: boolean): void => {
        container.style.display = visible ? '' : 'none'
        if (visible) return
        enableCheckbox.checked = false
        if (brush.isEnabled()) {
            brush.setEnabled(false)
            onToggle(false)
        }
    }
    const unsubscribe = building.events.on('select', (id) => {
        setVisible(id !== undefined)
    })

    document.body.appendChild(container)
    setVisible(building.getSelectedId() !== undefined)

    return () => {
        unsubscribe()
        container.remove()
    }
}
