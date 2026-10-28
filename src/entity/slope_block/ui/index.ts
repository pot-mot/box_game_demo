import type {PanelContext} from '../../box/base/ui/index.ts'
import {createEntityPanel} from '../../../ui/components/entity_panel.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import {createSection} from '../../../ui/components/section.ts'
import {createSelect, materialOptions} from '../../building_generator/ui/labels.ts'
import {localizeText} from '../../../i18n/dom.ts'
import {SLOPE_BLOCK_MAX_SIZE} from '../constants.ts'
import type {SlopeBlockContext, SlopeBlockEntity} from '../types.ts'
import {DEFAULT_SLOPE_BLOCK_CONFIG, type SlopeBlockConfig} from '../validation.ts'

export const createSlopeBlockPanel = (ctx: Omit<SlopeBlockContext, 'panel'>): PanelContext => {
    const el = createEntityPanel('slope-block-panel', 'entity.slope_block_title')
    el.style.cssText += ';min-width:250px'

    el.appendChild(createSection('entity.params'))
    const size = createLabeledNumberInput(el, 'panel.size', {
        min: '1', max: String(SLOPE_BLOCK_MAX_SIZE), step: '1', value: String(DEFAULT_SLOPE_BLOCK_CONFIG.size),
    })
    size.id = 'slope-block-size'

    const axisRow = document.createElement('label')
    axisRow.className = 'dc-label'
    localizeText(axisRow, 'entity.slope_axis')
    const axis = createSelect([
        {value: 'x', label: 'X', render: () => 'X'},
        {value: 'z', label: 'Z', render: () => 'Z'},
    ], DEFAULT_SLOPE_BLOCK_CONFIG.axis)
    axis.id = 'slope-block-axis'
    axisRow.appendChild(axis)
    el.appendChild(axisRow)

    const materialRow = document.createElement('label')
    materialRow.className = 'dc-label'
    localizeText(materialRow, 'panel.material')
    const material = createSelect(materialOptions(), DEFAULT_SLOPE_BLOCK_CONFIG.material)
    material.id = 'slope-block-material'
    materialRow.appendChild(material)
    el.appendChild(materialRow)

    el.appendChild(createSection('entity.pos_yaw'))
    const posX = createLabeledNumberInput(el, 'panel.x', {step: '0.5'})
    const posY = createLabeledNumberInput(el, 'panel.y', {step: '0.5'})
    const posZ = createLabeledNumberInput(el, 'panel.z', {step: '0.5'})
    const yaw = createLabeledNumberInput(el, 'entity.yaw', {min: '0', max: '270', step: '90'})

    const {container: buttonRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(buttonRow)

    const selected = (): SlopeBlockEntity | undefined => ctx.getById(ctx.getSelectedId() ?? -1)

    const readConfig = (): SlopeBlockConfig => ({
        size: Math.max(1, Math.min(SLOPE_BLOCK_MAX_SIZE, Math.trunc(Number.parseFloat(size.value) || DEFAULT_SLOPE_BLOCK_CONFIG.size))),
        axis: axis.value === 'z' ? 'z' : 'x',
        material: material.value as SlopeBlockConfig['material'],
    })

    applyBtn.onclick = () => {
        const entity = selected()
        if (entity === undefined) return
        ctx.updateConfig(entity.id, readConfig())
        const x = Number.parseFloat(posX.value)
        const y = Number.parseFloat(posY.value)
        const z = Number.parseFloat(posZ.value)
        const rotY = Number.parseFloat(yaw.value)
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
            ctx.setTransform(entity.id, {x, y, z}, {x: 0, y: Number.isFinite(rotY) ? rotY : 0, z: 0})
        }
    }

    deleteBtn.onclick = () => {
        const id = ctx.getSelectedId()
        if (id !== undefined) ctx.remove(id)
    }

    const refresh = (): void => {
        if (el.contains(document.activeElement)) return
        const entity = selected()
        if (entity === undefined) return
        size.value = String(entity.config.size)
        axis.value = entity.config.axis
        material.value = entity.config.material
        posX.value = entity.mesh.position.x.toFixed(2)
        posY.value = entity.mesh.position.y.toFixed(2)
        posZ.value = entity.mesh.position.z.toFixed(2)
        yaw.value = String(Math.round(entity.mesh.rotation.y * 180 / Math.PI / 90) * 90)
    }

    return {
        render: (container: HTMLElement) => {
            container.appendChild(el)
            el.style.display = 'block'
            refresh()
        },
        destroy: () => { el.remove() },
        update: refresh,
    }
}
