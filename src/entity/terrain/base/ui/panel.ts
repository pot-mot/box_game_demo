import type {PanelContext} from '../../../box/base/ui'
import type {BaseTerrainEntity} from '../types'
import type {TerrainContext} from '../types'
import {createLabeledNumberInput} from '../../../../ui/components/number_input.ts'
import {createSection} from '../../../../ui/components/section.ts'
import {createButtonRow} from '../../../../ui/components/button_row.ts'
import {createEntityPanel} from '../../../../ui/components/entity_panel.ts'
import {localizeText} from '../../../../i18n/dom.ts'
import type {StringLocaleKey} from '../../../../i18n/index.ts'

export const createTerrainPanel = (ctx: Omit<TerrainContext, 'panel'>, generatorOptions: {id: string; labelKey: StringLocaleKey}[]): PanelContext => {
    const el = createEntityPanel('terrain-panel', 'entity.terrain_control')

    el.appendChild(createSection('panel.pos'))
    const posX = createLabeledNumberInput(el, 'panel.x', {step: '0.01'})
    const posZ = createLabeledNumberInput(el, 'panel.z', {step: '0.01'})

    el.appendChild(createSection('panel.rot'))
    const rotX = createLabeledNumberInput(el, 'panel.x', {min: '-360', max: '360', step: '0.1'})
    const rotY = createLabeledNumberInput(el, 'panel.y', {min: '-360', max: '360', step: '0.1'})
    const rotZ = createLabeledNumberInput(el, 'panel.z', {min: '-360', max: '360', step: '0.1'})

    el.appendChild(createSection('panel.generator'))
    const genSelect = document.createElement('select')
    genSelect.className = 'dc-select'
    genSelect.style.cssText = 'width:100%;margin:4px 0'
    for (const g of generatorOptions) {
        const opt = document.createElement('option')
        opt.value = g.id
        localizeText(opt, g.labelKey)
        genSelect.appendChild(opt)
    }
    el.appendChild(genSelect)

    el.appendChild(createSection('panel.height'))
    const minH = createLabeledNumberInput(el, 'panel.min', {step: '0.1'})
    const maxH = createLabeledNumberInput(el, 'panel.max', {step: '0.1'})

    el.appendChild(createSection('panel.size'))
    const gridSize = createLabeledNumberInput(el, 'panel.grid', {min: '4', max: '64', step: '1'})
    const cellSize = createLabeledNumberInput(el, 'panel.cell', {min: '0.1', step: '0.1'})

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
