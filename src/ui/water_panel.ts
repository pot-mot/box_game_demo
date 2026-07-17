import type {WaterBlockConfig, WaterBoxContext, WaterPanelContext} from '../water_block/types/water.ts'
import type {DeepReadonly} from '../types/readonly.ts'

type NumberInputAttrs = DeepReadonly<{
    step?: string
    min?: string
    max?: string
    value?: string
    style?: string
}>

const DEFAULT_STEP = '0.01'

const createNumberInput = (attrs: NumberInputAttrs = {}): HTMLInputElement => {
    const input = document.createElement('input')
    input.type = 'number'
    input.step = attrs.step ?? DEFAULT_STEP
    if (attrs.min !== undefined) input.min = attrs.min
    if (attrs.max !== undefined) input.max = attrs.max
    if (attrs.value !== undefined) input.value = attrs.value
    if (attrs.style) input.style.cssText = attrs.style

    input.addEventListener('change', () => {
        const val = parseFloat(input.value)
        if (isNaN(val)) return
        const min = attrs.min !== undefined ? parseFloat(attrs.min) : undefined
        const max = attrs.max !== undefined ? parseFloat(attrs.max) : undefined
        if (min !== undefined && val < min) input.value = attrs.min!
        if (max !== undefined && val > max) input.value = attrs.max!
    })

    return input
}

const createLabeledNumberInput = (parent: HTMLElement, label: string, attrs: NumberInputAttrs = {}): HTMLInputElement => {
    const input = createNumberInput(attrs)
    const labelEl = document.createElement('label')
    labelEl.textContent = label + ' '
    labelEl.appendChild(input)
    parent.appendChild(labelEl)
    return input
}

const createSection = (title: string): HTMLDivElement => {
    const div = document.createElement('div')
    div.style.cssText = 'border-top:1px solid #555;padding:4px 0'
    div.textContent = title
    return div
}

export const setupWaterPanel = (water: WaterBoxContext): WaterPanelContext => {
    const el = document.createElement('div')
    el.id = 'water-control'
    el.style.cssText = [
        'position: fixed; bottom: 24px; right: 24px;',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.5 monospace; padding: 16px 20px;',
        'border-radius: 10px; min-width: 230px;',
        'user-select: none; display: none;',
    ].join(' ')

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:14px;color:#48f'
    header.textContent = 'Water Block Control'
    el.appendChild(header)

    el.appendChild(createSection('Pos'))
    const posX = createLabeledNumberInput(el, 'X', {step: '0.01'})
    const posY = createLabeledNumberInput(el, 'Y', {step: '0.01'})
    const posZ = createLabeledNumberInput(el, 'Z', {step: '0.01'})

    el.appendChild(createSection('Size'))
    const sizeX = createLabeledNumberInput(el, 'X', {min: '0.1', max: '100', step: '0.1', value: '2'})
    const sizeY = createLabeledNumberInput(el, 'Y', {min: '0.1', max: '100', step: '0.1', value: '2'})
    const sizeZ = createLabeledNumberInput(el, 'Z', {min: '0.1', max: '100', step: '0.1', value: '2'})

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px'
    const applyBtn = document.createElement('button')
    applyBtn.style.flex = '1'
    applyBtn.textContent = 'Apply'
    const deleteBtn = document.createElement('button')
    deleteBtn.style.flex = '1'
    deleteBtn.textContent = 'Delete'
    btnRow.appendChild(applyBtn)
    btnRow.appendChild(deleteBtn)
    el.appendChild(btnRow)

    document.body.appendChild(el)

    applyBtn.addEventListener('click', () => {
        const sel = water.getSelected()
        if (!sel) return
        water.setBlockPosition(sel.id, {
            x: parseFloat(posX.value),
            y: parseFloat(posY.value),
            z: parseFloat(posZ.value),
        })
        water.updateBlockSize(sel.id, {
            width: parseFloat(sizeX.value),
            height: parseFloat(sizeY.value),
            depth: parseFloat(sizeZ.value),
        })
    })

    deleteBtn.addEventListener('click', () => {
        const sel = water.getSelected()
        if (sel) {
            water.removeBlock(sel.id)
            hide()
        }
    })

    const showForBox = (config: WaterBlockConfig, pos: {x: number; y: number; z: number}): void => {
        el.style.display = 'block'
        posX.value = pos.x.toFixed(2)
        posY.value = pos.y.toFixed(2)
        posZ.value = pos.z.toFixed(2)
        sizeX.value = String(config.width)
        sizeY.value = String(config.height)
        sizeZ.value = String(config.depth)
    }

    const hide = (): void => {
        el.style.display = 'none'
    }

    return {showForBox, hide}
}
