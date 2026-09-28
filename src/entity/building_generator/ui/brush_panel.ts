import {SURFACE_MATERIAL_IDS} from '../../../render/materials/index.ts'
import {BUILDING_PROP_KINDS} from '../props/kinds.ts'
import {BUILDING_RECIPE_IDS} from '../generators/structures.ts'
import {DEFAULT_BUILDING_CONFIG} from '../validation.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createSelect, findIn, materialOptions, propOptions} from './labels.ts'
import type {BuildingBrush, BuildingBrushTool} from '../edit/brush.ts'

const BRUSH_TOOLS = ['place', 'erase', 'prop', 'fill', 'replace', 'stamp'] as const

const TOOL_LABELS: Record<BuildingBrushTool, string> = {
    place: '放置体素',
    erase: '擦除体素',
    prop: '放置道具',
    fill: '区域填充',
    replace: '区域替换',
    stamp: '预制体',
}

/**
 * 建造笔刷面板（编辑模式常驻）：工具 / 材质 / 道具种类 / 预制体参数 + 启用开关。
 * 启用时通过 `onToggle` 通知编辑模式关闭实体选中 / 生成交互。
 */
export const setupBuildingBrushPanel = (
    brush: BuildingBrush,
    onToggle: (enabled: boolean) => void,
): (() => void) => {
    const container = document.createElement('div')
    container.id = 'building-brush-panel'
    container.style.cssText = [
        'position: fixed; bottom: 24px; left: 16px;',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.6 monospace; padding: 10px 14px;',
        'border-radius: 8px; min-width: 200px;',
        'user-select: none;',
    ].join(' ')

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:6px'
    header.textContent = '建筑笔刷'
    container.appendChild(header)

    const toolRow = document.createElement('label')
    toolRow.textContent = '工具 '
    const toolSelect = createSelect(
        BRUSH_TOOLS.map(tool => ({value: tool, label: TOOL_LABELS[tool]})),
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
    materialRow.textContent = '材质 '
    const materialSelect = createSelect(materialOptions(), brush.getMaterial())
    materialSelect.id = 'brush-material'
    materialSelect.addEventListener('change', () => {
        const matched = findIn(SURFACE_MATERIAL_IDS, materialSelect.value)
        if (matched !== undefined) brush.setMaterial(matched)
    })
    materialRow.appendChild(materialSelect)
    container.appendChild(materialRow)

    const propRow = document.createElement('label')
    propRow.textContent = '道具 '
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
    recipeRow.textContent = '配方 '
    const recipeSelect = createSelect(
        BUILDING_RECIPE_IDS.map(id => ({value: id, label: id})),
        brush.getStampConfig().recipe,
    )
    recipeSelect.id = 'brush-stamp-recipe'
    recipeRow.appendChild(recipeSelect)
    stampBox.appendChild(recipeRow)
    const seedInput = createLabeledNumberInput(stampBox, '种子', {step: '1', value: String(DEFAULT_BUILDING_CONFIG.seed)})
    const sizeXInput = createLabeledNumberInput(stampBox, 'X', {min: '1', max: '64', step: '1', value: String(DEFAULT_BUILDING_CONFIG.sizeX)})
    const sizeYInput = createLabeledNumberInput(stampBox, 'Y', {min: '1', max: '64', step: '1', value: String(DEFAULT_BUILDING_CONFIG.sizeY)})
    const sizeZInput = createLabeledNumberInput(stampBox, 'Z', {min: '1', max: '64', step: '1', value: String(DEFAULT_BUILDING_CONFIG.sizeZ)})
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
    enableRow.appendChild(document.createTextNode(' 启用（左键单击）'))
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

    document.body.appendChild(container)

    return () => {
        /* 面板为静态控件，无需逐帧刷新 */
    }
}
