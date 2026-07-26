import type {PanelContext} from '../../../box/base/ui'
import type {BaseTerrainEntity} from '../types'
import type {TerrainContext} from '../types'
import {createLabeledNumberInput} from '../../../../ui/components/number_input.ts'
import {createSection} from '../../../../ui/components/section.ts'
import {createButtonRow} from '../../../../ui/components/button_row.ts'

export const createTerrainPanel = (ctx: TerrainContext, generatorOptions: {id: string; label: string}[]): PanelContext => {
    const el = document.createElement('div')
    el.id = 'terrain-panel'
    el.style.cssText = [
        'position: fixed; bottom: 24px; right: 24px;',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.5 monospace; padding: 16px 20px;',
        'border-radius: 10px; min-width: 230px;',
        'user-select: none; display: none;',
    ].join(' ')

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:14px;color:#684'
    header.textContent = 'Terrain Control'
    el.appendChild(header)

    el.appendChild(createSection('Pos'))
    const posX = createLabeledNumberInput(el, 'X', {step: '0.01'})
    const posZ = createLabeledNumberInput(el, 'Z', {step: '0.01'})

    el.appendChild(createSection('Rot (°)'))
    const rotX = createLabeledNumberInput(el, 'X', {min: '-360', max: '360', step: '0.1'})
    const rotY = createLabeledNumberInput(el, 'Y', {min: '-360', max: '360', step: '0.1'})
    const rotZ = createLabeledNumberInput(el, 'Z', {min: '-360', max: '360', step: '0.1'})

    el.appendChild(createSection('Generator'))
    const genSelect = document.createElement('select')
    genSelect.style.cssText = 'width:100%;padding:4px;margin:4px 0;font:inherit'
    for (const g of generatorOptions) {
        const opt = document.createElement('option')
        opt.value = g.id
        opt.textContent = g.label
        genSelect.appendChild(opt)
    }
    el.appendChild(genSelect)

    el.appendChild(createSection('Height'))
    const minH = createLabeledNumberInput(el, 'Min', {step: '0.1'})
    const maxH = createLabeledNumberInput(el, 'Max', {step: '0.1'})

    el.appendChild(createSection('Size'))
    const gridSize = createLabeledNumberInput(el, 'Grid', {min: '4', max: '64', step: '1'})
    const cellSize = createLabeledNumberInput(el, 'Cell', {min: '0.1', step: '0.1'})

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    return {
        render: (container: HTMLElement) => {
            const sel = ctx.getSelected() as BaseTerrainEntity | undefined
            if (!sel) return
            container.appendChild(el)
            el.style.display = 'block'
            posX.value = sel.mesh.position.x.toFixed(2)
            posZ.value = sel.mesh.position.z.toFixed(2)
            rotX.value = (sel.mesh.rotation.x * 180 / Math.PI).toFixed(1)
            rotY.value = (sel.mesh.rotation.y * 180 / Math.PI).toFixed(1)
            rotZ.value = (sel.mesh.rotation.z * 180 / Math.PI).toFixed(1)
            genSelect.value = sel.config.generatorId
            minH.value = String(sel.config.minHeight)
            maxH.value = String(sel.config.maxHeight)
            gridSize.value = String(sel.config.gridSize)
            cellSize.value = String(sel.config.cellSize)

            applyBtn.onclick = () => {
                let newMin = Number(minH.value)
                let newMax = Number(maxH.value)
                if (newMin > newMax) [newMin, newMax] = [newMax, newMin]
                ctx.setTransform(sel.id, {
                    x: Number(posX.value),
                    y: 0,
                    z: Number(posZ.value),
                }, {
                    x: parseFloat(rotX.value),
                    y: parseFloat(rotY.value),
                    z: parseFloat(rotZ.value),
                })
                ctx.updateConfig(sel.id, {
                    generatorId: genSelect.value,
                    minHeight: newMin,
                    maxHeight: newMax,
                    gridSize: Number(gridSize.value),
                    cellSize: Number(cellSize.value),
                })
            }
            deleteBtn.onclick = () => {
                ctx.remove(sel.id)
            }
        },
        destroy: () => {
            el.remove()
        },
    }
}
