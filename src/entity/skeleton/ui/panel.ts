import {Euler} from 'three'
import type {PanelContext} from '../../box/base/ui'
import type {JointCascadeSettings} from '../../../skeleton/skeleton.ts'
import {connectJoint, disconnectJoint, createSkeletonJoint} from '../../../skeleton/joint.ts'
import {setBoneLength, setBoneRoll} from '../../../skeleton/bone.ts'
import {setSelectedVisual, clearSelectedVisuals} from '../render/joint_groups.ts'
import type {SkeletonSelection, SkeletonEntity} from '../world.ts'
import {createLabeledNumberInput, createNumberInput} from '../../../ui/components/number_input.ts'
import {createSection} from '../../../ui/components/section.ts'
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
    title.style.cssText = 'font-weight:600;margin-bottom:4px'
    title.textContent = `关节：${joint.name}（${joint.id}）`
    container.appendChild(title)

    /* 位置 */
    container.appendChild(createSection('位置'))
    const posRow = document.createElement('div')
    posRow.style.cssText = 'display:flex;gap:4px'
    const posX = createLabeledNumberInput(posRow, 'X', {value: String(joint.position.x)})
    const posY = createLabeledNumberInput(posRow, 'Y', {value: String(joint.position.y)})
    const posZ = createLabeledNumberInput(posRow, 'Z', {value: String(joint.position.z)})
    container.appendChild(posRow)

    /* 旋转（欧拉，XYZ 顺序） */
    container.appendChild(createSection('旋转（欧拉）'))
    const rotRow = document.createElement('div')
    rotRow.style.cssText = 'display:flex;gap:4px'
    const euler = new Euler().setFromQuaternion(joint.rotation, EULER_ORDER)
    const rotX = createLabeledNumberInput(rotRow, 'X', {value: String(euler.x)})
    const rotY = createLabeledNumberInput(rotRow, 'Y', {value: String(euler.y)})
    const rotZ = createLabeledNumberInput(rotRow, 'Z', {value: String(euler.z)})
    container.appendChild(rotRow)

    /* 级联编辑（拖拽平移/旋转时子节点跟随策略） */
    container.appendChild(createSection('级联编辑'))
    const settings = ctx.getCascadeSettings()
    const cascadeRow = document.createElement('div')
    cascadeRow.style.cssText = 'display:flex;align-items:center;gap:8px'
    const cascadeCheck = document.createElement('input')
    cascadeCheck.type = 'checkbox'
    cascadeCheck.checked = settings.enabled
    const cascadeLabelEl = document.createElement('label')
    cascadeLabelEl.textContent = '级联子节点'
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
    depthLabelEl.textContent = '层数 '
    depthLabelEl.style.cssText = 'display:flex;align-items:center;gap:4px'
    depthLabelEl.appendChild(depthInput)
    cascadeRow.appendChild(cascadeLabelEl)
    cascadeRow.appendChild(depthLabelEl)
    container.appendChild(cascadeRow)
    const cascadeHint = document.createElement('div')
    cascadeHint.style.cssText = 'color:#889;font-size:10px;margin-top:2px'
    cascadeHint.textContent = '开：子节点（≤层数）跟随调整，层数外后代保持原位；关：仅本节点变化'
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
    container.appendChild(createSection('IK 根级别'))
    const levelSelect = document.createElement('select')
    const levelOptions = [
        {value: '', label: '无（普通关节）'},
        {value: '0', label: '0（最高级根）'},
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
    container.appendChild(createSection('父关节'))
    const parentSelect = document.createElement('select')
    const noneOption = document.createElement('option')
    noneOption.value = ''
    noneOption.textContent = '（无 - 独立根）'
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
    container.appendChild(createSection('添加子关节'))
    const childRow = document.createElement('div')
    childRow.style.cssText = 'display:flex;gap:4px'
    const childName = document.createElement('input')
    childName.placeholder = '新关节名'
    const addChildBtn = document.createElement('button')
    addChildBtn.textContent = '添加'
    childRow.appendChild(childName)
    childRow.appendChild(addChildBtn)
    container.appendChild(childRow)

    /* 按钮行 */
    const applyBtn = document.createElement('button')
    applyBtn.style.cssText = 'flex:1;margin-top:8px'
    applyBtn.textContent = 'Apply'
    const deleteBtn = document.createElement('button')
    deleteBtn.style.cssText = 'flex:1;margin-top:8px'
    deleteBtn.textContent = 'Delete'
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:8px'
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
    title.style.cssText = 'font-weight:600;margin-bottom:4px'
    title.textContent = `骨骼：${bone.name}（${bone.id}）`
    container.appendChild(title)

    container.appendChild(createSection('长度'))
    const lengthInput = createLabeledNumberInput(container, 'L', {value: String(bone.length)})

    container.appendChild(createSection('绕轴扭转 roll'))
    const rollInput = createLabeledNumberInput(container, 'R', {value: String(bone.roll)})

    const applyBtn = document.createElement('button')
    applyBtn.style.cssText = 'flex:1;margin-top:8px'
    applyBtn.textContent = 'Apply'
    const deleteBtn = document.createElement('button')
    deleteBtn.style.cssText = 'flex:1;margin-top:8px'
    deleteBtn.textContent = 'Delete'
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:8px'
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
            container.textContent = '未创建骨架实体'
            return
        }
        const selection = ctx.getSelection()
        if (selection === undefined) {
            container.textContent = '未选中关节或骨骼'
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