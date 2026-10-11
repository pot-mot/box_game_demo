import type {PanelContext} from '../../base/ui'
import type {MagnetEntityContext, MagnetBox} from '../types'
import {createNumberInput, createLabeledNumberInput} from '../../../../ui/components/number_input.ts'
import {createSection} from '../../../../ui/components/section.ts'
import {createButtonRow} from '../../../../ui/components/button_row.ts'
import {createEntityPanel, appendLabeledInputRow} from '../../../../ui/components/entity_panel.ts'

export const formatRowText = (box: MagnetBox): string =>
    `#${box.id}  (${box.mesh.position.x.toFixed(1)}, ${box.mesh.position.y.toFixed(1)}, ${box.mesh.position.z.toFixed(1)})  ${box.config.width}×${box.config.height}×${box.config.depth}  R:${box.config.attractionRadius}  S:${box.config.attractionStrength}`

export const createMagnetPanel = (ctx: Omit<MagnetEntityContext, 'panel'>): PanelContext => {
    const el = createEntityPanel('magnet-box-panel', 'entity.magnet')

    el.appendChild(createSection('panel.attraction'))
    const radiusInput = createLabeledNumberInput(el, 'panel.radius', {min: '0.1', max: '50', step: '0.5', value: '5', style: 'width:70px'})
    const strengthInput = createLabeledNumberInput(el, 'panel.strength', {min: '0', max: '100', step: '0.5', value: '10', style: 'width:70px'})

    el.appendChild(createSection('panel.pos'))
    const posX = createLabeledNumberInput(el, 'panel.x', {step: '0.01'})
    const posY = createLabeledNumberInput(el, 'panel.y', {step: '0.01'})
    const posZ = createLabeledNumberInput(el, 'panel.z', {step: '0.01'})

    el.appendChild(createSection('panel.rot'))
    const rotX = createLabeledNumberInput(el, 'panel.x', {min: '-360', max: '360', step: '0.1'})
    const rotY = createLabeledNumberInput(el, 'panel.y', {min: '-360', max: '360', step: '0.1'})
    const rotZ = createLabeledNumberInput(el, 'panel.z', {min: '-360', max: '360', step: '0.1'})

    el.appendChild(createSection('panel.size'))
    const sizeX = createLabeledNumberInput(el, 'panel.x', {min: '0.1', max: '100', step: '0.1', value: '1'})
    const sizeY = createLabeledNumberInput(el, 'panel.y', {min: '0.1', max: '100', step: '0.1', value: '1'})
    const sizeZ = createLabeledNumberInput(el, 'panel.z', {min: '0.1', max: '100', step: '0.1', value: '1'})

    const mass = createNumberInput({min: '0', step: '0.1', value: '0', style: 'width:80px'})
    appendLabeledInputRow(el, 'entity.mass', mass)

    const friction = createLabeledNumberInput(el, 'panel.friction', {min: '0', max: '1', step: '0.01', value: '0.3', style: 'width:80px'})

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    const refreshValues = (): void => {
        /* 输入框聚焦中不刷新，避免覆盖用户输入 */
        if (el.contains(document.activeElement)) return
        const sel = ctx.getSelected()
        if (!sel) return
        radiusInput.value = String(sel.config.attractionRadius)
        strengthInput.value = String(sel.config.attractionStrength)
        posX.value = sel.mesh.position.x.toFixed(2)
        posY.value = sel.mesh.position.y.toFixed(2)
        posZ.value = sel.mesh.position.z.toFixed(2)
        rotX.value = (sel.mesh.rotation.x * 180 / Math.PI).toFixed(1)
        rotY.value = (sel.mesh.rotation.y * 180 / Math.PI).toFixed(1)
        rotZ.value = (sel.mesh.rotation.z * 180 / Math.PI).toFixed(1)
        sizeX.value = String(sel.config.width)
        sizeY.value = String(sel.config.height)
        sizeZ.value = String(sel.config.depth)
        mass.value = String(sel.config.mass)
        friction.value = String(sel.config.friction)
    }

    return {
        render: (container: HTMLElement) => {
            container.appendChild(el)
            el.style.display = 'block'
            refreshValues()

            const onApply = () => {
                const cur = ctx.getSelected()
                if (!cur) return
                ctx.setTransform(cur.id, {
                    x: parseFloat(posX.value), y: parseFloat(posY.value), z: parseFloat(posZ.value),
                }, {
                    x: parseFloat(rotX.value), y: parseFloat(rotY.value), z: parseFloat(rotZ.value),
                })
                ctx.updateConfig(cur.id, {
                    width: parseFloat(sizeX.value), height: parseFloat(sizeY.value), depth: parseFloat(sizeZ.value),
                    mass: parseFloat(mass.value), friction: parseFloat(friction.value),
                    attractionRadius: parseFloat(radiusInput.value) || cur.config.attractionRadius,
                    attractionStrength: parseFloat(strengthInput.value) || cur.config.attractionStrength,
                })
            }
            const onDelete = () => {
                const cur = ctx.getSelected()
                if (cur) ctx.remove(cur.id)
            }
            applyBtn.onclick = onApply
            deleteBtn.onclick = onDelete
        },
        destroy: () => {
            el.remove()
        },
        update: refreshValues,
    }
}
