import type {BoxConfig, CommonContext} from '../common_box/types/physics.ts'
import type {PanelContext} from '../types/ui.ts'
import type {DeepReadonly} from '../types/readonly.ts'

// ── Number Input factory ──────────────────────────────────────────────

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

// ── Section helper ─────────────────────────────────────────────

const createSection = (title: string): HTMLDivElement => {
    const div = document.createElement('div')
    div.style.cssText = 'border-top:1px solid #555;padding:4px 0'
    div.textContent = title
    return div
}

// ── Panel ──────────────────────────────────────────────────────

export const setupBoxControlPanel = (physics: CommonContext): PanelContext => {
    const el = document.createElement('div')
    el.id = 'box-control'
    el.style.cssText = [
        'position: fixed; bottom: 24px; right: 24px;',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.5 monospace; padding: 16px 20px;',
        'border-radius: 10px; min-width: 230px;',
        'user-select: none; display: none;',
    ].join(' ')

    // Header
    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:14px'
    header.textContent = 'Box Control'
    el.appendChild(header)

    // Position
    el.appendChild(createSection('Pos'))
    const posX = createLabeledNumberInput(el, 'X', {step: '0.01'} as const)
    const posY = createLabeledNumberInput(el, 'Y', {step: '0.01'} as const)
    const posZ = createLabeledNumberInput(el, 'Z', {step: '0.01'} as const)

    // Rotation (degrees, clamped to ±360)
    el.appendChild(createSection('Rot (°)'))
    const rotX = createLabeledNumberInput(el, 'X', {min: '-360', max: '360', step: '0.1'} as const)
    const rotY = createLabeledNumberInput(el, 'Y', {min: '-360', max: '360', step: '0.1'} as const)
    const rotZ = createLabeledNumberInput(el, 'Z', {min: '-360', max: '360', step: '0.1'} as const)

    // Size (positive, max 100)
    el.appendChild(createSection('Size'))
    const sizeX = createLabeledNumberInput(el, 'X', {min: '0.1', max: '100', step: '0.1', value: '1'} as const)
    const sizeY = createLabeledNumberInput(el, 'Y', {min: '0.1', max: '100', step: '0.1', value: '1'} as const)
    const sizeZ = createLabeledNumberInput(el, 'Z', {min: '0.1', max: '100', step: '0.1', value: '1'} as const)

    // Mass (label inside the section divider)
    const massSection = document.createElement('div')
    massSection.style.cssText = 'border-top:1px solid #555;padding:4px 0'
    const massLabel = document.createElement('label')
    massLabel.textContent = 'Mass '
    const mass = createNumberInput({min: '0', step: '0.1', value: '0', style: 'width:80px'} as const)
    massLabel.appendChild(mass)
    massSection.appendChild(massLabel)
    el.appendChild(massSection)

    // Friction
    const friction = createLabeledNumberInput(el, 'Friction', {min: '0', max: '1', step: '0.01', value: '0.3', style: 'width:80px'} as const)

    // Buttons
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px'
    const applyBtn = document.createElement('button')
    applyBtn.id = 'bc-apply'
    applyBtn.style.flex = '1'
    applyBtn.textContent = 'Apply'
    const deleteBtn = document.createElement('button')
    deleteBtn.id = 'bc-delete'
    deleteBtn.style.flex = '1'
    deleteBtn.textContent = 'Delete'
    btnRow.appendChild(applyBtn)
    btnRow.appendChild(deleteBtn)
    el.appendChild(btnRow)

    document.body.appendChild(el)

    // ── Event handlers ───────────────────────────────────────────

    applyBtn.addEventListener('click', () => {
        const sel = physics.getSelected()
        if (!sel) return
        physics.setBoxTransform(sel.id, {
            x: parseFloat(posX.value),
            y: parseFloat(posY.value),
            z: parseFloat(posZ.value),
        }, {
            x: parseFloat(rotX.value),
            y: parseFloat(rotY.value),
            z: parseFloat(rotZ.value),
        })
        physics.updateBox(sel.id, {
            width: parseFloat(sizeX.value),
            height: parseFloat(sizeY.value),
            depth: parseFloat(sizeZ.value),
            mass: parseFloat(mass.value),
            friction: parseFloat(friction.value),
        })
    })

    deleteBtn.addEventListener('click', () => {
        const sel = physics.getSelected()
        if (sel) {
            physics.removeBox(sel.id)
            hide()
        }
    })

    // ── Show / Hide ──────────────────────────────────────────────

    const showForBox = (
        config: BoxConfig,
        pos: { x: number; y: number; z: number },
        rotDeg: { x: number; y: number; z: number },
    ) => {
        el.style.display = 'block'
        posX.value = pos.x.toFixed(2)
        posY.value = pos.y.toFixed(2)
        posZ.value = pos.z.toFixed(2)
        rotX.value = rotDeg.x.toFixed(1)
        rotY.value = rotDeg.y.toFixed(1)
        rotZ.value = rotDeg.z.toFixed(1)
        sizeX.value = String(config.width)
        sizeY.value = String(config.height)
        sizeZ.value = String(config.depth)
        mass.value = String(config.mass)
        friction.value = String(config.friction)
    }

    const hide = () => {
        el.style.display = 'none'
    }

    return {showForBox, hide}
}
