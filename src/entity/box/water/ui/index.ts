import type {PanelContext} from '../../base/ui'
import type {WaterEntityContext, WaterBlock} from '../types'

export const formatRowText = (box: WaterBlock): string =>
    `#${box.id}  (${box.mesh.position.x.toFixed(1)}, ${box.mesh.position.y.toFixed(1)}, ${box.mesh.position.z.toFixed(1)})  ${box.config.width}×${box.config.height}×${box.config.depth}`

const DEFAULT_STEP = '0.01'

const createNumberInput = (attrs: Record<string, string>): HTMLInputElement => {
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
        if (attrs.min !== undefined && val < parseFloat(attrs.min)) input.value = attrs.min
        if (attrs.max !== undefined && val > parseFloat(attrs.max)) input.value = attrs.max
    })
    return input
}

const createLabeledNumberInput = (parent: HTMLElement, label: string, attrs: Record<string, string> = {}): HTMLInputElement => {
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

export const createWaterPanel = (ctx: WaterEntityContext): PanelContext => {
    const el = document.createElement('div')
    el.id = 'water-block-panel'
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

    return {
        render: (container: HTMLElement) => {
            const sel = ctx.getSelected()
            if (!sel) return
            container.appendChild(el)
            el.style.display = 'block'
            posX.value = sel.mesh.position.x.toFixed(2)
            posY.value = sel.mesh.position.y.toFixed(2)
            posZ.value = sel.mesh.position.z.toFixed(2)
            sizeX.value = String(sel.config.width)
            sizeY.value = String(sel.config.height)
            sizeZ.value = String(sel.config.depth)

            applyBtn.onclick = () => {
                const cur = ctx.getSelected()
                if (!cur) return
                ctx.setPosition(cur.id, {
                    x: parseFloat(posX.value),
                    y: parseFloat(posY.value),
                    z: parseFloat(posZ.value),
                })
                ctx.resize(cur.id, {
                    width: parseFloat(sizeX.value),
                    height: parseFloat(sizeY.value),
                    depth: parseFloat(sizeZ.value),
                })
            }
            deleteBtn.onclick = () => {
                const cur = ctx.getSelected()
                if (cur) ctx.remove(cur.id)
            }
        },
        destroy: () => {
            el.remove()
        },
    }
}
