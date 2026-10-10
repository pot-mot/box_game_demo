import type {PanelContext} from '../../base/ui'
import type {ElasticEntityContext, ElasticBox} from '../types'
import {createNumberInput, createLabeledNumberInput} from '../../../../ui/components/number_input.ts'
import {createSection} from '../../../../ui/components/section.ts'
import {createButtonRow} from '../../../../ui/components/button_row.ts'
import {localizeText} from '../../../../i18n/dom.ts'

export const formatRowText = (box: ElasticBox): string =>
    `#${box.id}  (${box.mesh.position.x.toFixed(1)}, ${box.mesh.position.y.toFixed(1)}, ${box.mesh.position.z.toFixed(1)})  ${box.config.width.toFixed(2)}×${box.config.height.toFixed(2)}×${box.config.depth.toFixed(2)}  Δ:${box.def[0].toFixed(3)}/${box.def[1].toFixed(3)}/${box.def[2].toFixed(3)}`

export const createElasticPanel = (ctx: Omit<ElasticEntityContext, 'panel'>): PanelContext => {
    const el = document.createElement('div')
    el.id = 'elastic-box-panel'
    el.style.cssText = [
        'position: fixed; bottom: 24px; right: 24px;',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.5 monospace; padding: 16px 20px;',
        'border-radius: 10px; min-width: 230px;',
        'user-select: none; display: none;',
    ].join(' ')

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:14px;color:#66bb88'
    localizeText(header, 'panel.elastic')
    el.appendChild(header)

    el.appendChild(createSection('panel.elastic'))
    const stiffnessInput = createLabeledNumberInput(el, 'panel.stiffness', {min: '1', max: '500', step: '1', value: '80', style: 'width:70px'})
    const dampingInput = createLabeledNumberInput(el, 'panel.damping', {min: '0.01', max: '2', step: '0.01', value: '0.12', style: 'width:70px'})
    const maxDeformInput = createLabeledNumberInput(el, 'panel.max_deform', {min: '0.01', max: '0.8', step: '0.01', value: '0.3', style: 'width:70px'})

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

    const massSection = document.createElement('div')
    massSection.style.cssText = 'border-top:1px solid #555;padding:4px 0'
    const massLabel = document.createElement('label')
    const massText = document.createElement('span')
    localizeText(massText, 'entity.mass')
    massLabel.appendChild(massText)
    massLabel.appendChild(document.createTextNode(' '))
    const mass = createNumberInput({min: '0', step: '0.1', value: '0', style: 'width:80px'})
    massLabel.appendChild(mass)
    massSection.appendChild(massLabel)
    el.appendChild(massSection)

    const friction = createLabeledNumberInput(el, 'panel.friction', {min: '0', max: '1', step: '0.01', value: '0.3', style: 'width:80px'})

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    const refreshValues = (): void => {
        /* 输入框聚焦中不刷新，避免覆盖用户输入 */
        if (el.contains(document.activeElement)) return
        const sel = ctx.getSelected()
        if (!sel) return
        stiffnessInput.value = String(sel.config.stiffness)
        dampingInput.value = String(sel.config.dampingRatio)
        maxDeformInput.value = String(sel.config.maxDeformFraction)
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
                    width: parseFloat(sizeX.value),
                    height: parseFloat(sizeY.value),
                    depth: parseFloat(sizeZ.value),
                    mass: parseFloat(mass.value) || cur.config.mass,
                    friction: parseFloat(friction.value) || cur.config.friction,
                    stiffness: parseFloat(stiffnessInput.value) || cur.config.stiffness,
                    dampingRatio: parseFloat(dampingInput.value) || cur.config.dampingRatio,
                    maxDeformFraction: parseFloat(maxDeformInput.value) || cur.config.maxDeformFraction,
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