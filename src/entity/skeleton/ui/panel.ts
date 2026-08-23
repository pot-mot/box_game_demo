import {Euler} from 'three'
import type {PanelContext} from '../../box/base/ui'
import {connectJoint, disconnectJoint, createSkeletonJoint} from '../../../skeleton/joint.ts'
import {setBoneLength, setBoneRoll} from '../../../skeleton/bone.ts'
import {setGizmoSelected} from '../render/joint_groups.ts'
import type {SkeletonSelection, SkeletonEntity} from '../world.ts'
import {createLabeledNumberInput} from '../../../ui/components/number_input.ts'
import {createSection} from '../../../ui/components/section.ts'

/** 面板所需的实体上下文（由 world 装配，两阶段初始化） */
export interface SkeletonPanelContext {
    getFocus: () => SkeletonEntity | undefined
    getSelection: () => SkeletonSelection | undefined
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
const renderJointPanel = (ctx: SkeletonPanelContext, container: HTMLElement): void => {
    const entity = ctx.getFocus()
    const selection = ctx.getSelection()
    if (entity === undefined || selection === undefined || selection.kind !== 'joint') return
    const skeleton = entity.skeleton
    const joint = skeleton.findJoint(selection.id)
    if (joint === undefined) return

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
}

/** 骨骼段属性面板：长度（面板输入）/roll/删除 */
const renderBonePanel = (ctx: SkeletonPanelContext, container: HTMLElement): void => {
    const entity = ctx.getFocus()
    const selection = ctx.getSelection()
    if (entity === undefined || selection === undefined || selection.kind !== 'bone') return
    const skeleton = entity.skeleton
    const bone = skeleton.findBone(selection.id)
    if (bone === undefined) return

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
}

/** 骨骼实体属性面板（PanelContext 协议，焦点在 focusPanel 容器） */
export const createSkeletonPanel = (ctx: SkeletonPanelContext): PanelContext => {
    const render = (container: HTMLElement): void => {
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
            renderJointPanel(ctx, container)
        } else {
            renderBonePanel(ctx, container)
        }
        setGizmoSelected(entity.visuals.gizmos, selection.id, true)
    }

    const destroy = (): void => {
        const entity = ctx.getFocus()
        const selection = ctx.getSelection()
        if (entity !== undefined && selection !== undefined && selection.kind === 'joint') {
            setGizmoSelected(entity.visuals.gizmos, selection.id, false)
        }
    }

    return {render, destroy}
}