import type {BoxConfig, PhysicsContext} from '../types/physics.ts'
import type {PanelContext} from '../types/ui.ts'

// ── Input factory ──────────────────────────────────────────────

type InputAttrs = Partial<Omit<HTMLInputElement, 'style'>> & {style?: string}

const INPUT_DEFAULTS: InputAttrs = {
    type: 'number',
    step: '0.01',
}

const createInput = (attrs: InputAttrs = {}): HTMLInputElement => {
    const input = document.createElement('input')
    Object.assign(input, INPUT_DEFAULTS, attrs)
    if (attrs.style) {
        input.style.cssText = attrs.style
    }
    return input
}

const createLabeledInput = (parent: HTMLElement, label: string, attrs: InputAttrs = {}): HTMLInputElement => {
    const input = createInput(attrs)
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

export const setupBoxControlPanel = (physics: PhysicsContext): PanelContext => {
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
    const posX = createLabeledInput(el, 'X', {step: '0.01'})
    const posY = createLabeledInput(el, 'Y', {step: '0.01'})
    const posZ = createLabeledInput(el, 'Z', {step: '0.01'})

    // Rotation (degrees, clamped to ±360)
    el.appendChild(createSection('Rot (°)'))
    const rotX = createLabeledInput(el, 'X', {min: '-360', max: '360', step: '0.1'})
    const rotY = createLabeledInput(el, 'Y', {min: '-360', max: '360', step: '0.1'})
    const rotZ = createLabeledInput(el, 'Z', {min: '-360', max: '360', step: '0.1'})

    // Size (positive, max 100)
    el.appendChild(createSection('Size'))
    const sizeX = createLabeledInput(el, 'X', {min: '0.1', max: '100', step: '0.1', value: '1'})
    const sizeY = createLabeledInput(el, 'Y', {min: '0.1', max: '100', step: '0.1', value: '1'})
    const sizeZ = createLabeledInput(el, 'Z', {min: '0.1', max: '100', step: '0.1', value: '1'})

    // Mass (label inside the section divider)
    const massSection = document.createElement('div')
    massSection.style.cssText = 'border-top:1px solid #555;padding:4px 0'
    const massLabel = document.createElement('label')
    massLabel.textContent = 'Mass '
    const mass = createInput({min: '0', step: '0.1', value: '0', style: 'width:80px'})
    massLabel.appendChild(mass)
    massSection.appendChild(massLabel)
    el.appendChild(massSection)

    // Friction
    const friction = createLabeledInput(el, 'Friction', {min: '0', max: '1', step: '0.01', value: '0.3', style: 'width:80px'})

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
