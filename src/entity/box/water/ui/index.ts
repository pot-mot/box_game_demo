import type {PanelContext} from '../../base/ui'
import type {WaterEntityContext, WaterBlock} from '../types'
import {createLabeledNumberInput} from '../../../../ui/components/number_input.ts'
import {createSection} from '../../../../ui/components/section.ts'
import {createButtonRow} from '../../../../ui/components/button_row.ts'

export const formatRowText = (box: WaterBlock): string =>
    `#${box.id}  (${box.mesh.position.x.toFixed(1)}, ${box.mesh.position.y.toFixed(1)}, ${box.mesh.position.z.toFixed(1)})  ${box.config.width}×${box.config.height}×${box.config.depth}  d:${box.config.density}`

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

    el.appendChild(createSection('Buoyancy'))
    const density = createLabeledNumberInput(el, 'Density', {min: '0', max: '100', step: '0.1', value: '2'})

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
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
            density.value = String(sel.config.density)

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
                    density: parseFloat(density.value),
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
