import type {PanelContext} from '../../../box/base/ui'
import type {FragmentEntityContext, Fragment} from '../types'
import {createNumberInput, createLabeledNumberInput} from '../../../../ui/components/number_input.ts'
import {createSection} from '../../../../ui/components/section.ts'
import {createButtonRow} from '../../../../ui/components/button_row.ts'

export const formatRowText = (f: Fragment): string =>
    `${f.label}  (${f.mesh.position.x.toFixed(1)}, ${f.mesh.position.y.toFixed(1)}, ${f.mesh.position.z.toFixed(1)})  m:${f.config.mass.toFixed(2)}  ttl:${f.config.lifetime.toFixed(1)}`

export const createFragmentPanel = (ctx: FragmentEntityContext): PanelContext => {
    const el = document.createElement('div')
    el.id = 'fragment-panel'
    el.style.cssText = [
        'position: fixed; bottom: 24px; right: 24px;',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.5 monospace; padding: 16px 20px;',
        'border-radius: 10px; min-width: 230px;',
        'user-select: none; display: none;',
    ].join(' ')

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:14px;color:#888'
    header.textContent = 'Fragment'
    el.appendChild(header)

    el.appendChild(createSection('Lifetime'))
    const lifetimeInput = createLabeledNumberInput(el, 'Remaining', {min: '0', step: '0.1', value: '5', style: 'width:70px'})
    const maxLifetimeInput = createLabeledNumberInput(el, 'Max', {min: '0.1', step: '0.1', value: '5', style: 'width:70px'})

    el.appendChild(createSection('Rot (°)'))
    const rotX = createLabeledNumberInput(el, 'X', {min: '-360', max: '360', step: '0.1'})
    const rotY = createLabeledNumberInput(el, 'Y', {min: '-360', max: '360', step: '0.1'})
    const rotZ = createLabeledNumberInput(el, 'Z', {min: '-360', max: '360', step: '0.1'})

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
            lifetimeInput.value = sel.config.lifetime.toFixed(1)
            maxLifetimeInput.value = sel.config.maxLifetime.toFixed(1)
            rotX.value = (sel.mesh.rotation.x * 180 / Math.PI).toFixed(1)
            rotY.value = (sel.mesh.rotation.y * 180 / Math.PI).toFixed(1)
            rotZ.value = (sel.mesh.rotation.z * 180 / Math.PI).toFixed(1)
            mass.value = String(sel.config.mass)
            friction.value = String(sel.config.friction)

            applyBtn.onclick = () => {
                const cur = ctx.getSelected()
                if (!cur) return
                ctx.setTransform(cur.id, {
                    x: cur.mesh.position.x, y: cur.mesh.position.y, z: cur.mesh.position.z,
                }, {
                    x: parseFloat(rotX.value), y: parseFloat(rotY.value), z: parseFloat(rotZ.value),
                })
                ctx.updateConfig(cur.id, {
                    mass: parseFloat(mass.value) || cur.config.mass,
                    friction: parseFloat(friction.value) ?? cur.config.friction,
                    maxLifetime: parseFloat(maxLifetimeInput.value) || cur.config.maxLifetime,
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
