import {Euler} from 'three'
import type {PanelContext} from '../../box/base/ui'
import type {JointCascadeSettings} from '../../../skeleton/skeleton.ts'
import {connectJoint, disconnectJoint, createSkeletonJoint} from '../../../skeleton/joint.ts'
import {setBoneLength, setBoneRoll} from '../../../skeleton/bone.ts'
import {setSelectedVisual, clearSelectedVisuals} from '../render/joint_groups.ts'
import type {SkeletonSelection, SkeletonEntity} from '../world.ts'
import {createLabeledNumberInput, createNumberInput} from '../../../ui/components/number_input.ts'
import {createSection} from '../../../ui/components/section.ts'
import {localizeText, localizePlaceholder, appendLocalizedText} from '../../../i18n/dom.ts'
import {translate} from '../../../i18n/index.ts'
import {CASCADE_DEPTH_MAX} from '../constants.ts'

/** 面板所需的实体上下文（由 world 装配，两阶段初始化） */
export interface SkeletonPanelContext {
    getFocus: () => SkeletonEntity | undefined
    getSelection: () => SkeletonSelection | undefined
    /** 级联编辑设置（开关 + 层数，面板修改、指针读取） */
    getCascadeSettings: () => JointCascadeSettings
    /** 领域编辑后刷新：FK + 写回场景图 + 部件缩放 */
    refresh: () => void
    /** 重开面板（选中变化后由 world 调用） */
    reopen: () => void
}

const EULER_ORDER: 'XYZ' = 'XYZ'

const valueOf = (input: HTMLInputElement): number => {
    const val = parseFloat(input.value)
    return Number.isNaN(val) ? 0 : val
}

/** 关节属性面板：位置/旋转/IK 根级别/父关节/添加子关节/删除 */
const renderJointPanel = (ctx: SkeletonPanelContext, container: HTMLElement): (() => void) => {
    const entity = ctx.getFocus()
    const selection = ctx.getSelection()
    if (entity === undefined || selection === undefined || selection.kind !== 'joint') return () => {}
    const skeleton = entity.skeleton
    const joint = skeleton.findJoint(selection.id)
    if (joint === undefined) return () => {}

    const title = document.createElement('div')
    title.className = 'dc-panel__title'
    title.textContent = translate({key: 'skeleton.joint_title', args: [joint.name, joint.id]})
    container.appendChild(title)

    /* 位置 */
    container.appendChild(createSection('skeleton.pos'))
    const posRow = document.createElement('div')
    posRow.className = 'dc-row'
    posRow.style.cssText = 'gap:4px'
    const posX = createLabeledNumberInput(posRow, 'panel.x', {value: String(joint.position.x)})
    const posY = createLabeledNumberInput(posRow, 'panel.y', {value: String(joint.position.y)})
    const posZ = createLabeledNumberInput(posRow, 'panel.z', {value: String(joint.position.z)})
    container.appendChild(posRow)

    /* 旋转（欧拉，XYZ 顺序） */
    container.appendChild(createSection('skeleton.rot_euler'))
    const rotRow = document.createElement('div')
    rotRow.className = 'dc-row'
    rotRow.style.cssText = 'gap:4px'
    const euler = new Euler().setFromQuaternion(joint.rotation, EULER_ORDER)
    const rotX = createLabeledNumberInput(rotRow, 'panel.x', {value: String(euler.x)})
    const rotY = createLabeledNumberInput(rotRow, 'panel.y', {value: String(euler.y)})
    const rotZ = createLabeledNumberInput(rotRow, 'panel.z', {value: String(euler.z)})
    container.appendChild(rotRow)

    /* 级联编辑（拖拽平移/旋转时子节点跟随策略） */
    container.appendChild(createSection('skeleton.cascade'))
    const settings = ctx.getCascadeSettings()
    const cascadeRow = document.createElement('div')
    cascadeRow.className = 'dc-row'
    cascadeRow.style.cssText = 'gap:8px'
    const cascadeCheck = document.createElement('input')
    cascadeCheck.type = 'checkbox'
    cascadeCheck.className = 'dc-check'
    cascadeCheck.checked = settings.enabled
    const cascadeLabelEl = document.createElement('label')
    const cascadeText = document.createElement('span')
    localizeText(cascadeText, 'skeleton.cascade_children')
    cascadeLabelEl.appendChild(cascadeText)
    cascadeLabelEl.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer'
    cascadeLabelEl.appendChild(cascadeCheck)
    const depthInput = createNumberInput({
        value: String(settings.depth),
        min: '1',
        max: String(CASCADE_DEPTH_MAX),
        step: '1',
        style: 'width:48px',
    })
    const depthLabelEl = document.createElement('label')
    const depthText = document.createElement('span')
    localizeText(depthText, 'skeleton.depth')
    depthLabelEl.appendChild(depthText)
    depthLabelEl.appendChild(document.createTextNode(' '))
    depthLabelEl.style.cssText = 'display:flex;align-items:center;gap:4px'
    depthLabelEl.appendChild(depthInput)
    cascadeRow.appendChild(cascadeLabelEl)
    cascadeRow.appendChild(depthLabelEl)
    container.appendChild(cascadeRow)
    const cascadeHint = document.createElement('div')
    cascadeHint.className = 'dc-hint'
    cascadeHint.style.cssText = 'margin-top:2px'
    localizeText(cascadeHint, 'skeleton.cascade_hint')
    container.appendChild(cascadeHint)

    cascadeCheck.addEventListener('change', () => {
        settings.enabled = cascadeCheck.checked
    })
    depthInput.addEventListener('change', () => {
        const raw = parseFloat(depthInput.value)
        const clamped = Number.isNaN(raw)
            ? 1
            : Math.max(1, Math.min(CASCADE_DEPTH_MAX, Math.round(raw)))
        settings.depth = clamped
        depthInput.value = String(clamped)
    })

    /* IK 根级别 */
    container.appendChild(createSection('skeleton.ik_root'))
    const levelSelect = document.createElement('select')
    levelSelect.className = 'dc-select'
    const levelOptions = [
        {value: '', label: translate('skeleton.ik_none')},
        {value: '0', label: translate('skeleton.ik_level0')},
        {value: '1', label: '1'},
        {value: '2', label: '2'},
    ] as const
    for (const opt of levelOptions) {
        const el = document.createElement('option')
        el.value = opt.value
        el.textContent = opt.label
        levelSelect.appendChild(el)
    }
    levelSelect.value = joint.ikRootLevel !== undefined ? String(joint.ikRootLevel) : ''
    container.appendChild(levelSelect)

    /* 父关节重连 */
    container.appendChild(createSection('skeleton.parent'))
    const parentSelect = document.createElement('select')
    parentSelect.className = 'dc-select'
    const noneOption = document.createElement('option')
    noneOption.value = ''
    noneOption.textContent = translate('skeleton.parent_none')
    parentSelect.appendChild(noneOption)
    for (const other of skeleton.joints.values()) {
        if (other.id === joint.id) continue
        const el = document.createElement('option')
        el.value = other.id
        el.textContent = `${other.name}（${other.id}）`
        parentSelect.appendChild(el)
    }
    parentSelect.value = joint.parent?.id ?? ''
    container.appendChild(parentSelect)

    /* 添加子关节 */
    container.appendChild(createSection('skeleton.add_child'))
    const childRow = document.createElement('div')
    childRow.className = 'dc-row'
    childRow.style.cssText = 'gap:4px'
    const childName = document.createElement('input')
    childName.className = 'dc-input'
    localizePlaceholder(childName, 'skeleton.new_joint_name')
    const addChildBtn = document.createElement('button')
    addChildBtn.className = 'dc-btn'
    localizeText(addChildBtn, 'common.add')
    childRow.appendChild(childName)
    childRow.appendChild(addChildBtn)
    container.appendChild(childRow)

    /* 按钮行 */
    const applyBtn = document.createElement('button')
    applyBtn.className = 'dc-btn dc-btn--primary'
    applyBtn.style.cssText = 'flex:1;margin-top:8px'
    localizeText(applyBtn, 'common.apply')
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'dc-btn dc-btn--danger'
    deleteBtn.style.cssText = 'flex:1;margin-top:8px'
    localizeText(deleteBtn, 'common.delete')
    const btnRow = document.createElement('div')
    btnRow.className = 'dc-row'
    btnRow.style.cssText = 'gap:8px'
    btnRow.appendChild(applyBtn)
    btnRow.appendChild(deleteBtn)
    container.appendChild(btnRow)

    applyBtn.addEventListener('click', () => {
        joint.position.set(valueOf(posX), valueOf(posY), valueOf(posZ))
        joint.rotation.setFromEuler(new Euler(valueOf(rotX), valueOf(rotY), valueOf(rotZ), EULER_ORDER))
        joint.ikRootLevel = levelSelect.value === '' ? undefined : Number(levelSelect.value)
        const newParentId = parentSelect.value === '' ? undefined : parentSelect.value
        if (joint.parent?.id !== newParentId) {
            if (joint.parent !== undefined) disconnectJoint(joint)
            if (newParentId !== undefined) {
                const newParent = skeleton.findJoint(newParentId)
                if (newParent !== undefined) connectJoint(newParent, joint)
            }
        }
        ctx.refresh()
        ctx.reopen()
    })

    addChildBtn.addEventListener('click', () => {
        const name = childName.value.trim()
        if (name === '') return
        const child = createSkeletonJoint(name)
        skeleton.addJoint(child)
        connectJoint(joint, child)
        ctx.refresh()
        ctx.reopen()
    })

    deleteBtn.addEventListener('click', () => {
        skeleton.removeJoint(joint.id)
        ctx.refresh()
        ctx.reopen()
    })

    /** 返回刷新函数：gizmo 拖拽时实时更新位置/旋转输入值 */
    return (): void => {
        const cur = ctx.getFocus()?.skeleton.findJoint(selection.id)
        if (cur === undefined) return
        posX.value = String(cur.position.x)
        posY.value = String(cur.position.y)
        posZ.value = String(cur.position.z)
        const curEuler = new Euler().setFromQuaternion(cur.rotation, EULER_ORDER)
        rotX.value = String(curEuler.x)
        rotY.value = String(curEuler.y)
        rotZ.value = String(curEuler.z)
    }
}

/** 骨骼段属性面板：长度（面板输入）/roll/删除 */
const renderBonePanel = (ctx: SkeletonPanelContext, container: HTMLElement): (() => void) => {
    const entity = ctx.getFocus()
    const selection = ctx.getSelection()
    if (entity === undefined || selection === undefined || selection.kind !== 'bone') return () => {}
    const skeleton = entity.skeleton
    const bone = skeleton.findBone(selection.id)
    if (bone === undefined) return () => {}

    const title = document.createElement('div')
    title.className = 'dc-panel__title'
    title.textContent = translate({key: 'skeleton.bone_title', args: [bone.name, bone.id]})
    container.appendChild(title)

    container.appendChild(createSection('skeleton.length'))
    const lengthInput = createLabeledNumberInput(container, 'skeleton.l', {value: String(bone.length)})

    container.appendChild(createSection('skeleton.roll'))
    const rollInput = createLabeledNumberInput(container, 'skeleton.r', {value: String(bone.roll)})

    const applyBtn = document.createElement('button')
    applyBtn.className = 'dc-btn dc-btn--primary'
    applyBtn.style.cssText = 'flex:1;margin-top:8px'
    localizeText(applyBtn, 'common.apply')
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'dc-btn dc-btn--danger'
    deleteBtn.style.cssText = 'flex:1;margin-top:8px'
    localizeText(deleteBtn, 'common.delete')
    const btnRow = document.createElement('div')
    btnRow.className = 'dc-row'
    btnRow.style.cssText = 'gap:8px'
    btnRow.appendChild(applyBtn)
    btnRow.appendChild(deleteBtn)
    container.appendChild(btnRow)

    applyBtn.addEventListener('click', () => {
        const length = valueOf(lengthInput)
        if (length > 0) setBoneLength(skeleton, bone, length)
        setBoneRoll(bone, valueOf(rollInput))
        ctx.refresh()
        ctx.reopen()
    })

    deleteBtn.addEventListener('click', () => {
        skeleton.removeBone(bone.id)
        ctx.refresh()
        ctx.reopen()
    })

    /** 骨骼段无 gizmo 拖拽场景，返回空刷新 */
    return () => {}
}

/** 骨骼实体属性面板（PanelContext 协议，焦点在 focusPanel 容器） */
export const createSkeletonPanel = (ctx: SkeletonPanelContext): PanelContext => {
    /** 当前面板的刷新函数（render 时赋值，由 update 调用） */
    let refreshValues: (() => void) | undefined
    /** 面板容器（render 时赋值，update 用于焦点检查） */
    let panelContainer: HTMLElement | undefined

    const render = (container: HTMLElement): void => {
        panelContainer = container
        refreshValues = undefined
        const entity = ctx.getFocus()
        if (entity === undefined) {
            appendLocalizedText(container, 'skeleton.no_entity')
            return
        }
        const selection = ctx.getSelection()
        if (selection === undefined) {
            appendLocalizedText(container, 'skeleton.no_selection')
            return
        }
        if (selection.kind === 'joint') {
            refreshValues = renderJointPanel(ctx, container)
        } else {
            refreshValues = renderBonePanel(ctx, container)
        }
        /* 选中高亮：关节小球 / 骨骼段菱形 */
        setSelectedVisual(entity.visuals, selection, true)
    }

    const destroy = (): void => {
        const entity = ctx.getFocus()
        if (entity !== undefined) {
            clearSelectedVisuals(entity.visuals)
        }
        refreshValues = undefined
    }

    const update = (): void => {
        /* 输入框聚焦中不刷新，避免覆盖用户输入 */
        if (panelContainer?.contains(document.activeElement) === true) return
        refreshValues?.()
    }

    return {render, destroy, update}
}