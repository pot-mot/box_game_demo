import type {PanelContext} from '../../../box/base/ui'
import type {FragmentEntityContext, Fragment} from '../types'
import {createNumberInput, createLabeledNumberInput} from '../../../../ui/components/number_input.ts'
import {createSection} from '../../../../ui/components/section.ts'
import {createButtonRow} from '../../../../ui/components/button_row.ts'
import {createEntityPanel, appendLabeledInputRow} from '../../../../ui/components/entity_panel.ts'

export const formatRowText = (f: Fragment): string =>
    `${f.label}  (${f.mesh.position.x.toFixed(1)}, ${f.mesh.position.y.toFixed(1)}, ${f.mesh.position.z.toFixed(1)})  m:${f.config.mass.toFixed(2)}  ttl:${f.config.lifetime.toFixed(1)}`

export const createFragmentPanel = (ctx: Omit<FragmentEntityContext, 'panel'>): PanelContext => {
    const el = createEntityPanel('fragment-panel', 'entity.fragment')

    el.appendChild(createSection('panel.lifetime'))
    const lifetimeInput = createLabeledNumberInput(el, 'entity.remaining', {min: '0', step: '0.1', value: '5', style: 'width:70px'})
    const maxLifetimeInput = createLabeledNumberInput(el, 'panel.max', {min: '0.1', step: '0.1', value: '5', style: 'width:70px'})

    el.appendChild(createSection('panel.rot'))
    const rotX = createLabeledNumberInput(el, 'panel.x', {min: '-360', max: '360', step: '0.1'})
    const rotY = createLabeledNumberInput(el, 'panel.y', {min: '-360', max: '360', step: '0.1'})
    const rotZ = createLabeledNumberInput(el, 'panel.z', {min: '-360', max: '360', step: '0.1'})

    const mass = createNumberInput({min: '0', step: '0.1', value: '0', style: 'width:80px'})
    appendLabeledInputRow(el, 'entity.mass', mass)

    const friction = createLabeledNumberInput(el, 'panel.friction', {min: '0', max: '1', step: '0.01', value: '0.3', style: 'width:80px'})

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
