import type {PanelContext} from '../base/ui'
import type {Box, BoxEntityContext} from '../types'
import {SURFACE_MATERIAL_IDS, type SurfaceMaterialId} from '../../../render/materials/ids.ts'
import {
    DESTRUCTIBLE_DEFAULTS,
    BURNING_DEFAULTS,
    MAGNET_DEFAULTS,
    ELASTIC_DEFAULTS,
    FRAGMENT_COUNT_MIN,
    FRAGMENT_COUNT_MAX,
} from '../physics/constants.ts'
import {createNumberInput, createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createSection} from '../../../ui/components/section.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import {createEntityPanel, appendLabeledInputRow} from '../../../ui/components/entity_panel.ts'
import {localizeText, localizeApply} from '../../../i18n/dom.ts'
import {translate, type StringLocaleKey} from '../../../i18n/index.ts'

/** 表面材质本地化名键（本面板局部维护，避免跨实体依赖建筑 UI） */
const MATERIAL_LABELS: Record<SurfaceMaterialId, StringLocaleKey> = {
    rock: 'material.rock',
    soil: 'material.soil',
    brick: 'material.brick',
    wood: 'material.wood',
    rusty_iron: 'material.rusty_iron',
    tile: 'material.tile',
    cloth: 'material.cloth',
}

/** 实体列表行文本（含坐标，供编辑模式列表 / e2e 读取世界位置） */
export const formatRowText = (box: Box): string => {
    let text = `#${box.id}  (${box.mesh.position.x.toFixed(1)}, ${box.mesh.position.y.toFixed(1)}, ${box.mesh.position.z.toFixed(1)})  ${box.config.width}×${box.config.height}×${box.config.depth}  m:${box.config.mass}`
    const dest = box.runtime.destructible
    if (dest !== undefined) text += `  HP:${dest.health.toFixed(0)}/${dest.maxHealth}`
    const burn = box.runtime.burning
    if (burn !== undefined) text += `  B:${burn.health.toFixed(0)}/${burn.maxHealth}`
    const elastic = box.runtime.elastic
    if (elastic !== undefined) text += `  Δ:${elastic.def[0].toFixed(3)}/${elastic.def[1].toFixed(3)}/${elastic.def[2].toFixed(3)}`
    return text
}

const createMaterialSelect = (current: SurfaceMaterialId): HTMLSelectElement => {
    const select = document.createElement('select')
    select.className = 'dc-select'
    for (const id of SURFACE_MATERIAL_IDS) {
        const opt = document.createElement('option')
        opt.value = id
        localizeApply(opt, el => { el.textContent = translate(MATERIAL_LABELS[id]) })
        select.appendChild(opt)
    }
    select.value = current
    return select
}

/** 追加「勾选 + 文本」的特性开关行 */
const appendTraitToggle = (parent: HTMLElement, labelKey: StringLocaleKey): HTMLInputElement => {
    const row = document.createElement('label')
    row.className = 'dc-label'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'dc-check'
    row.appendChild(checkbox)
    const text = document.createElement('span')
    localizeText(text, labelKey)
    row.appendChild(text)
    parent.appendChild(row)
    return checkbox
}

/** 追加一个特性块：标题勾选行 + 缩进的参数区，返回勾选框与参数容器 */
const appendTraitBlock = (
    parent: HTMLElement,
    labelKey: StringLocaleKey,
): {checkbox: HTMLInputElement; params: HTMLDivElement} => {
    const block = document.createElement('div')
    block.className = 'dc-section'
    const checkbox = appendTraitToggle(block, labelKey)
    const params = document.createElement('div')
    params.style.cssText = 'margin-left:18px'
    block.appendChild(params)
    parent.appendChild(block)
    return {checkbox, params}
}

export const createBoxPanel = (ctx: Omit<BoxEntityContext, 'panel'>): PanelContext => {
    const el = createEntityPanel('box-panel', 'entity.box_control')

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

    const materialSelect = createMaterialSelect('rock')
    materialSelect.id = 'box-material-select'
    appendLabeledInputRow(el, 'panel.material', materialSelect)

    el.appendChild(createSection('panel.traits'))
    const traitD = appendTraitBlock(el, 'entity.destructible_box')
    const maxHpD = createLabeledNumberInput(traitD.params, 'panel.max', {min: '1', step: '1', value: String(DESTRUCTIBLE_DEFAULTS.maxHealth)})
    const hpD = createLabeledNumberInput(traitD.params, 'panel.hp', {min: '0', step: '1', value: String(DESTRUCTIBLE_DEFAULTS.maxHealth)})
    const fragCountD = createLabeledNumberInput(traitD.params, 'panel.fragment_count', {
        min: String(FRAGMENT_COUNT_MIN), max: String(FRAGMENT_COUNT_MAX), step: '1',
        value: String(DESTRUCTIBLE_DEFAULTS.fragmentCount),
    })

    const traitB = appendTraitBlock(el, 'entity.burning_box')
    const maxHpB = createLabeledNumberInput(traitB.params, 'panel.max', {min: '1', step: '1', value: String(BURNING_DEFAULTS.maxHealth)})
    const hpB = createLabeledNumberInput(traitB.params, 'panel.hp', {min: '0', step: '1', value: String(BURNING_DEFAULTS.maxHealth)})

    const traitM = appendTraitBlock(el, 'entity.magnet')
    const radiusInput = createLabeledNumberInput(traitM.params, 'panel.radius', {min: '0.1', max: '50', step: '0.5', value: String(MAGNET_DEFAULTS.attractionRadius), style: 'width:70px'})
    const strengthInput = createLabeledNumberInput(traitM.params, 'panel.strength', {min: '0', max: '100', step: '0.5', value: String(MAGNET_DEFAULTS.attractionStrength), style: 'width:70px'})

    const traitE = appendTraitBlock(el, 'panel.elastic')
    const stiffnessInput = createLabeledNumberInput(traitE.params, 'panel.stiffness', {min: '1', max: '500', step: '1', value: String(ELASTIC_DEFAULTS.stiffness), style: 'width:70px'})
    const dampingInput = createLabeledNumberInput(traitE.params, 'panel.damping', {min: '0.01', max: '2', step: '0.01', value: String(ELASTIC_DEFAULTS.dampingRatio), style: 'width:70px'})
    const maxDeformInput = createLabeledNumberInput(traitE.params, 'panel.max_deform', {min: '0.01', max: '0.8', step: '0.01', value: String(ELASTIC_DEFAULTS.maxDeformFraction), style: 'width:70px'})

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    const refreshValues = (): void => {
        /* 输入框聚焦中不刷新，避免覆盖用户输入 */
        if (el.contains(document.activeElement)) return
        const sel = ctx.getSelected()
        if (!sel) return
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
        materialSelect.value = sel.config.material

        const dest = sel.config.destructible
        traitD.checkbox.checked = dest !== undefined
        maxHpD.value = String(dest?.maxHealth ?? DESTRUCTIBLE_DEFAULTS.maxHealth)
        hpD.value = String(sel.runtime.destructible?.health ?? dest?.maxHealth ?? DESTRUCTIBLE_DEFAULTS.maxHealth)
        fragCountD.value = String(dest?.fragmentCount ?? DESTRUCTIBLE_DEFAULTS.fragmentCount)

        const burn = sel.config.burning
        traitB.checkbox.checked = burn !== undefined
        maxHpB.value = String(burn?.maxHealth ?? BURNING_DEFAULTS.maxHealth)
        hpB.value = String(sel.runtime.burning?.health ?? burn?.maxHealth ?? BURNING_DEFAULTS.maxHealth)

        const magnet = sel.config.magnet
        traitM.checkbox.checked = magnet !== undefined
        radiusInput.value = String(magnet?.attractionRadius ?? MAGNET_DEFAULTS.attractionRadius)
        strengthInput.value = String(magnet?.attractionStrength ?? MAGNET_DEFAULTS.attractionStrength)

        const elastic = sel.config.elastic
        traitE.checkbox.checked = elastic !== undefined
        stiffnessInput.value = String(elastic?.stiffness ?? ELASTIC_DEFAULTS.stiffness)
        dampingInput.value = String(elastic?.dampingRatio ?? ELASTIC_DEFAULTS.dampingRatio)
        maxDeformInput.value = String(elastic?.maxDeformFraction ?? ELASTIC_DEFAULTS.maxDeformFraction)
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
                const material = SURFACE_MATERIAL_IDS.find(id => id === materialSelect.value) ?? cur.config.material
                ctx.updateConfig(cur.id, {
                    width: parseFloat(sizeX.value), height: parseFloat(sizeY.value), depth: parseFloat(sizeZ.value),
                    mass: parseFloat(mass.value), friction: parseFloat(friction.value),
                    material,
                    destructible: traitD.checkbox.checked
                        ? {
                            maxHealth: parseFloat(maxHpD.value) || DESTRUCTIBLE_DEFAULTS.maxHealth,
                            fragmentCount: Math.round(parseFloat(fragCountD.value)) || DESTRUCTIBLE_DEFAULTS.fragmentCount,
                        }
                        : undefined,
                    burning: traitB.checkbox.checked
                        ? {maxHealth: parseFloat(maxHpB.value) || BURNING_DEFAULTS.maxHealth}
                        : undefined,
                    magnet: traitM.checkbox.checked
                        ? {
                            attractionRadius: parseFloat(radiusInput.value) || MAGNET_DEFAULTS.attractionRadius,
                            attractionStrength: parseFloat(strengthInput.value) || MAGNET_DEFAULTS.attractionStrength,
                        }
                        : undefined,
                    elastic: traitE.checkbox.checked
                        ? {
                            stiffness: parseFloat(stiffnessInput.value) || ELASTIC_DEFAULTS.stiffness,
                            dampingRatio: parseFloat(dampingInput.value) || ELASTIC_DEFAULTS.dampingRatio,
                            maxDeformFraction: parseFloat(maxDeformInput.value) || ELASTIC_DEFAULTS.maxDeformFraction,
                        }
                        : undefined,
                })
                if (traitD.checkbox.checked) ctx.setTraitHealth(cur.id, 'destructible', parseFloat(hpD.value) || 0)
                if (traitB.checkbox.checked) ctx.setTraitHealth(cur.id, 'burning', parseFloat(hpB.value) || 0)
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
