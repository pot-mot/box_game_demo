import type {PanelContext} from '../../base/ui'
import type {DestructionEntityContext, DestructibleBox} from '../types'
import {createNumberInput, createLabeledNumberInput} from '../../../../ui/components/number_input.ts'
import {createSection} from '../../../../ui/components/section.ts'
import {createButtonRow} from '../../../../ui/components/button_row.ts'

export const formatRowText = (box: DestructibleBox): string =>
    `#${box.id}  (${box.mesh.position.x.toFixed(1)}, ${box.mesh.position.y.toFixed(1)}, ${box.mesh.position.z.toFixed(1)})  ${box.config.width}×${box.config.height}×${box.config.depth}  m:${box.config.mass}  HP:${box.health.toFixed(0)}/${box.config.maxHealth}`

export const createDestructionPanel = (ctx: DestructionEntityContext): PanelContext => {
    const el = document.createElement('div')
    el.id = 'destruction-box-panel'
    el.style.cssText = [
        'position: fixed; bottom: 24px; right: 24px;',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.5 monospace; padding: 16px 20px;',
        'border-radius: 10px; min-width: 230px;',
        'user-select: none; display: none;',
    ].join(' ')

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:14px;color:#ff6b6b'
    header.textContent = 'Destructible Box'
    el.appendChild(header)

    el.appendChild(createSection('Health'))
    const hpInput = createLabeledNumberInput(el, 'HP', {min: '0', step: '1', value: '8', style: 'width:70px'})
    const maxHpInput = createLabeledNumberInput(el, 'Max', {min: '1', step: '1', value: '8', style: 'width:70px'})

    el.appendChild(createSection('Pos'))
    const posX = createLabeledNumberInput(el, 'X', {step: '0.01'})
    const posY = createLabeledNumberInput(el, 'Y', {step: '0.01'})
    const posZ = createLabeledNumberInput(el, 'Z', {step: '0.01'})

    el.appendChild(createSection('Rot (°)'))
    const rotX = createLabeledNumberInput(el, 'X', {min: '-360', max: '360', step: '0.1'})
    const rotY = createLabeledNumberInput(el, 'Y', {min: '-360', max: '360', step: '0.1'})
    const rotZ = createLabeledNumberInput(el, 'Z', {min: '-360', max: '360', step: '0.1'})

    el.appendChild(createSection('Size'))
    const sizeX = createLabeledNumberInput(el, 'X', {min: '0.1', max: '100', step: '0.1', value: '1'})
    const sizeY = createLabeledNumberInput(el, 'Y', {min: '0.1', max: '100', step: '0.1', value: '1'})
    const sizeZ = createLabeledNumberInput(el, 'Z', {min: '0.1', max: '100', step: '0.1', value: '1'})

    const massSection = document.createElement('div')
    massSection.style.cssText = 'border-top:1px solid #555;padding:4px 0'
    const massLabel = document.createElement('label')
    massLabel.textContent = 'Mass '
    const mass = createNumberInput({min: '0', step: '0.1', value: '0', style: 'width:80px'})
    massLabel.appendChild(mass)
    massSection.appendChild(massLabel)
    el.appendChild(massSection)

    const friction = createLabeledNumberInput(el, 'Friction', {min: '0', max: '1', step: '0.01', value: '0.3', style: 'width:80px'})

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    return {
        render: (container: HTMLElement) => {
            const sel = ctx.getSelected()
            if (!sel) return
            container.appendChild(el)
            el.style.display = 'block'
            hpInput.value = String(sel.health)
            maxHpInput.value = String(sel.config.maxHealth)
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
                    maxHealth: parseFloat(maxHpInput.value) || cur.config.maxHealth,
                })
                ctx.setHealth(cur.id, parseFloat(hpInput.value) || 0)
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
    }
}
