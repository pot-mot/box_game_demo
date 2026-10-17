import type {PanelContext} from '../../box/base/ui'
import type {Area, AreaEntityContext, AreaShape} from '../types'
import type {AreaMaterialId, AreaShapeKind} from '../constants.ts'
import {AREA_MATERIAL_IDS, enabledFields} from '../constants.ts'
import {FLOAT_DEFAULTS, WIND_DEFAULTS, GRAVITY_DEFAULTS} from '../physics/constants.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createSection} from '../../../ui/components/section.ts'
import {createButtonRow} from '../../../ui/components/button_row.ts'
import {createEntityPanel} from '../../../ui/components/entity_panel.ts'
import {localizeText} from '../../../i18n/dom.ts'
import type {StringLocaleKey} from '../../../i18n/index.ts'

/** 视觉材质本地化名键 */
const MATERIAL_LABELS: Record<AreaMaterialId, StringLocaleKey> = {
    water: 'material.area_water',
    air: 'material.area_air',
    force_field: 'material.area_force_field',
}

const SHAPE_KIND_LABELS: Record<AreaShapeKind, StringLocaleKey> = {
    box: 'panel.shape.box',
    sphere: 'panel.shape.sphere',
    cylinder: 'panel.shape.cylinder',
}

const shapeSummaryOf = (shape: AreaShape): string => {
    if (shape.kind === 'box') return `${shape.width}×${shape.height}×${shape.depth}`
    if (shape.kind === 'sphere') return `r${shape.radius}`
    return `r${shape.radius}×h${shape.height}`
}

/** 实体列表行文本（含坐标，供编辑模式列表 / e2e 读取世界位置） */
export const formatRowText = (area: Area): string => {
    const p = area.mesh.position
    const fields = enabledFields(area.config.fields)
    return `#${area.id}  (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  ${shapeSummaryOf(area.config.shape)}  ${area.config.material}  [${fields.join(',')}]`
}

const createSelect = (options: ReadonlyArray<{value: string; labelKey: StringLocaleKey}>, current: string): HTMLSelectElement => {
    const select = document.createElement('select')
    select.className = 'dc-select'
    for (const opt of options) {
        const el = document.createElement('option')
        el.value = opt.value
        localizeText(el, opt.labelKey)
        select.appendChild(el)
    }
    select.value = current
    return select
}

/** 追加「勾选 + 文本」的开关行 */
const appendToggle = (parent: HTMLElement, labelKey: StringLocaleKey): HTMLInputElement => {
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

/** 追加一个场块：标题勾选行 + 缩进的参数区 */
const appendFieldBlock = (parent: HTMLElement, labelKey: StringLocaleKey): {checkbox: HTMLInputElement; params: HTMLDivElement} => {
    const block = document.createElement('div')
    block.className = 'dc-section'
    const checkbox = appendToggle(block, labelKey)
    const params = document.createElement('div')
    params.style.cssText = 'margin-left:18px'
    block.appendChild(params)
    parent.appendChild(block)
    return {checkbox, params}
}

export const createAreaPanel = (ctx: Omit<AreaEntityContext, 'panel'>): PanelContext => {
    const el = createEntityPanel('area-panel', 'entity.area_control')

    el.appendChild(createSection('panel.pos'))
    const posX = createLabeledNumberInput(el, 'panel.x', {step: '0.01'})
    const posY = createLabeledNumberInput(el, 'panel.y', {step: '0.01'})
    const posZ = createLabeledNumberInput(el, 'panel.z', {step: '0.01'})

    el.appendChild(createSection('panel.rot'))
    const rotX = createLabeledNumberInput(el, 'panel.x', {min: '-360', max: '360', step: '0.1'})
    const rotY = createLabeledNumberInput(el, 'panel.y', {min: '-360', max: '360', step: '0.1'})
    const rotZ = createLabeledNumberInput(el, 'panel.z', {min: '-360', max: '360', step: '0.1'})

    el.appendChild(createSection('panel.shape'))
    const kindSelect = createSelect(
        (['box', 'sphere', 'cylinder'] as const).map(v => ({value: v, labelKey: SHAPE_KIND_LABELS[v]})),
        'box',
    )
    kindSelect.id = 'area-shape-kind'
    {
        const row = document.createElement('label')
        row.className = 'dc-label'
        const text = document.createElement('span')
        localizeText(text, 'panel.shape_kind')
        row.appendChild(text)
        row.appendChild(kindSelect)
        el.appendChild(row)
    }
    const boxDims = document.createElement('div')
    const sizeX = createLabeledNumberInput(boxDims, 'panel.x', {min: '0.1', max: '100', step: '0.1', value: '2'})
    const sizeY = createLabeledNumberInput(boxDims, 'panel.y', {min: '0.1', max: '100', step: '0.1', value: '2'})
    const sizeZ = createLabeledNumberInput(boxDims, 'panel.z', {min: '0.1', max: '100', step: '0.1', value: '2'})
    el.appendChild(boxDims)
    const sphereDims = document.createElement('div')
    const sphereR = createLabeledNumberInput(sphereDims, 'panel.radius', {min: '0.1', max: '100', step: '0.1', value: '1'})
    el.appendChild(sphereDims)
    const cylinderDims = document.createElement('div')
    const cylinderR = createLabeledNumberInput(cylinderDims, 'panel.radius', {min: '0.1', max: '100', step: '0.1', value: '1'})
    const cylinderH = createLabeledNumberInput(cylinderDims, 'panel.height', {min: '0.1', max: '100', step: '0.1', value: '2'})
    el.appendChild(cylinderDims)

    el.appendChild(createSection('panel.material'))
    const materialSelect = createSelect(AREA_MATERIAL_IDS.map(v => ({value: v, labelKey: MATERIAL_LABELS[v]})), 'water')
    materialSelect.id = 'area-material-select'
    {
        const row = document.createElement('label')
        row.className = 'dc-label'
        const text = document.createElement('span')
        localizeText(text, 'panel.material')
        row.appendChild(text)
        row.appendChild(materialSelect)
        el.appendChild(row)
    }

    el.appendChild(createSection('panel.fields'))
    const floatBlock = appendFieldBlock(el, 'entity.field_float')
    const density = createLabeledNumberInput(floatBlock.params, 'panel.density', {min: '0', max: '100', step: '0.1', value: String(FLOAT_DEFAULTS.density)})
    const floatDrag = createLabeledNumberInput(floatBlock.params, 'panel.drag', {min: '0', max: '100', step: '0.1', value: String(FLOAT_DEFAULTS.drag)})

    const windBlock = appendFieldBlock(el, 'entity.field_wind')
    const windSpeed = createLabeledNumberInput(windBlock.params, 'panel.flow_speed', {min: '0', max: '100', step: '0.1', value: String(WIND_DEFAULTS.speed)})
    const windDX = createLabeledNumberInput(windBlock.params, 'panel.direction', {step: '0.1', value: String(WIND_DEFAULTS.dirX)})
    const windDY = createLabeledNumberInput(windBlock.params, 'panel.direction', {step: '0.1', value: String(WIND_DEFAULTS.dirY)})
    const windDZ = createLabeledNumberInput(windBlock.params, 'panel.direction', {step: '0.1', value: String(WIND_DEFAULTS.dirZ)})
    const windDrag = createLabeledNumberInput(windBlock.params, 'panel.drag', {min: '0', max: '100', step: '0.1', value: String(WIND_DEFAULTS.drag)})

    const gravityBlock = appendFieldBlock(el, 'entity.field_gravity')
    const gravityAX = createLabeledNumberInput(gravityBlock.params, 'panel.accel', {step: '0.1', value: String(GRAVITY_DEFAULTS.accelX)})
    const gravityAY = createLabeledNumberInput(gravityBlock.params, 'panel.accel', {step: '0.1', value: String(GRAVITY_DEFAULTS.accelY)})
    const gravityAZ = createLabeledNumberInput(gravityBlock.params, 'panel.accel', {step: '0.1', value: String(GRAVITY_DEFAULTS.accelZ)})

    const {container: btnRow, applyBtn, deleteBtn} = createButtonRow()
    el.appendChild(btnRow)

    const applyKindVisibility = (kind: string): void => {
        boxDims.style.display = kind === 'box' ? '' : 'none'
        sphereDims.style.display = kind === 'sphere' ? '' : 'none'
        cylinderDims.style.display = kind === 'cylinder' ? '' : 'none'
    }
    kindSelect.onchange = () => applyKindVisibility(kindSelect.value)

    const readShape = (): AreaShape => {
        const kind = kindSelect.value
        if (kind === 'sphere') return {kind: 'sphere', radius: parseFloat(sphereR.value) || 1}
        if (kind === 'cylinder') return {kind: 'cylinder', radius: parseFloat(cylinderR.value) || 1, height: parseFloat(cylinderH.value) || 2}
        return {
            kind: 'box',
            width: parseFloat(sizeX.value) || 2,
            height: parseFloat(sizeY.value) || 2,
            depth: parseFloat(sizeZ.value) || 2,
        }
    }

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

        const shape = sel.config.shape
        kindSelect.value = shape.kind
        applyKindVisibility(shape.kind)
        if (shape.kind === 'box') {
            sizeX.value = String(shape.width)
            sizeY.value = String(shape.height)
            sizeZ.value = String(shape.depth)
        } else if (shape.kind === 'sphere') {
            sphereR.value = String(shape.radius)
        } else {
            cylinderR.value = String(shape.radius)
            cylinderH.value = String(shape.height)
        }

        materialSelect.value = sel.config.material

        const f = sel.config.fields
        floatBlock.checkbox.checked = f.float !== undefined
        density.value = String(f.float?.density ?? FLOAT_DEFAULTS.density)
        floatDrag.value = String(f.float?.drag ?? FLOAT_DEFAULTS.drag)

        windBlock.checkbox.checked = f.wind !== undefined
        windSpeed.value = String(f.wind?.speed ?? WIND_DEFAULTS.speed)
        windDX.value = String(f.wind?.dirX ?? WIND_DEFAULTS.dirX)
        windDY.value = String(f.wind?.dirY ?? WIND_DEFAULTS.dirY)
        windDZ.value = String(f.wind?.dirZ ?? WIND_DEFAULTS.dirZ)
        windDrag.value = String(f.wind?.drag ?? WIND_DEFAULTS.drag)

        gravityBlock.checkbox.checked = f.gravity !== undefined
        gravityAX.value = String(f.gravity?.accelX ?? GRAVITY_DEFAULTS.accelX)
        gravityAY.value = String(f.gravity?.accelY ?? GRAVITY_DEFAULTS.accelY)
        gravityAZ.value = String(f.gravity?.accelZ ?? GRAVITY_DEFAULTS.accelZ)
    }

    return {
        render: (container: HTMLElement) => {
            container.appendChild(el)
            el.style.display = 'block'
            refreshValues()

            applyBtn.onclick = () => {
                const cur = ctx.getSelected()
                if (!cur) return
                ctx.setTransform(cur.id, {
                    x: parseFloat(posX.value), y: parseFloat(posY.value), z: parseFloat(posZ.value),
                }, {
                    x: parseFloat(rotX.value), y: parseFloat(rotY.value), z: parseFloat(rotZ.value),
                })
                const material = AREA_MATERIAL_IDS.find(id => id === materialSelect.value) ?? cur.config.material
                ctx.updateConfig(cur.id, {
                    shape: readShape(),
                    material,
                    fields: {
                        float: floatBlock.checkbox.checked
                            ? {
                                density: parseFloat(density.value) || FLOAT_DEFAULTS.density,
                                drag: parseFloat(floatDrag.value) || FLOAT_DEFAULTS.drag,
                            }
                            : undefined,
                        wind: windBlock.checkbox.checked
                            ? {
                                speed: parseFloat(windSpeed.value) || WIND_DEFAULTS.speed,
                                dirX: parseFloat(windDX.value) || WIND_DEFAULTS.dirX,
                                dirY: parseFloat(windDY.value) || WIND_DEFAULTS.dirY,
                                dirZ: parseFloat(windDZ.value) || WIND_DEFAULTS.dirZ,
                                drag: parseFloat(windDrag.value) || WIND_DEFAULTS.drag,
                            }
                            : undefined,
                        gravity: gravityBlock.checkbox.checked
                            ? {
                                accelX: parseFloat(gravityAX.value) || GRAVITY_DEFAULTS.accelX,
                                accelY: parseFloat(gravityAY.value) || GRAVITY_DEFAULTS.accelY,
                                accelZ: parseFloat(gravityAZ.value) || GRAVITY_DEFAULTS.accelZ,
                            }
                            : undefined,
                    },
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
        update: refreshValues,
    }
}
