import {ANIM_SELECT_ID, HANDEDNESS_SELECT_ID, TIMELINE_MAX_HEIGHT, TIMELINE_MIN_HEIGHT} from './constants.ts'
import {HANDEDNESS, HANDEDNESS_LABELS} from '../../character/handedness.ts'
import {translate, type StringLocaleKey} from '../../i18n/index.ts'
import {localizeText, localizeTitle} from '../../i18n/dom.ts'
import {createIcon} from '../../ui/icons/icon.ts'

/** 时间轴控制条 DOM 句柄（事件绑定由时间轴主装配完成） */
export interface TimelineControls {
    /** 控制条容器（武器控制等需追加控件） */
    readonly bar: HTMLElement
    readonly playBtn: HTMLButtonElement
    readonly stopBtn: HTMLButtonElement
    readonly loopInput: HTMLInputElement
    readonly animSelect: HTMLSelectElement
    readonly newAnimBtn: HTMLButtonElement
    readonly renameAnimBtn: HTMLButtonElement
    readonly delAnimBtn: HTMLButtonElement
    readonly durationInput: HTMLInputElement
    readonly speedInput: HTMLInputElement
    readonly addKeyBtn: HTMLButtonElement
    readonly addEventBtn: HTMLButtonElement
    readonly delKeyBtn: HTMLButtonElement
    readonly copyBtn: HTMLButtonElement
    readonly pasteBtn: HTMLButtonElement
    readonly onionBtn: HTMLButtonElement
    readonly ikBtn: HTMLButtonElement
    readonly undoBtn: HTMLButtonElement
    readonly redoBtn: HTMLButtonElement
    readonly exportBtn: HTMLButtonElement
    readonly importBtn: HTMLButtonElement
    readonly skeletonSelect: HTMLSelectElement
    /** 惯用手预览下拉（左撇子 = 聚焦骨架整体镜像；行为由时间轴主装配绑定） */
    readonly handednessSelect: HTMLSelectElement
    /** 当前面板高度（px，拖拽顶边改变） */
    readonly getHeight: () => number
}

/** 创建控制条按钮（内容与标题由调用方本地化） */
const makeButton = (): HTMLButtonElement => {
    const b = document.createElement('button')
    b.className = 'dc-btn'
    b.style.cssText = 'padding:2px 8px'
    return b
}

/** 创建控制条按钮：内容与可选标题均通过文案键本地化（随语言切换自动刷新） */
const makeTextButton = (labelKey: StringLocaleKey, titleKey?: StringLocaleKey): HTMLButtonElement => {
    const b = makeButton()
    localizeText(b, labelKey)
    if (titleKey !== undefined) localizeTitle(b, titleKey)
    return b
}

/**
 * 创建时间轴控制条（含可拖拽顶边手柄）：只负责 DOM 结构与高度拖拽，
 * 按钮行为由时间轴主装配绑定（避免控制条模块依赖播放/编辑逻辑）。
 */
export const createTimelineControls = (
    container: HTMLElement,
    initialHeight: number,
    onHeightChange: (height: number) => void,
): TimelineControls => {
    let panelHeight = initialHeight

    /* ── 拖拽手柄（可折叠/调高） ── */
    const handle = document.createElement('div')
    handle.style.cssText = 'height:6px;cursor:ns-resize;background:var(--dc-bg-3);flex-shrink:0'
    localizeTitle(handle, 'bone_edit.timeline.drag_height')
    container.appendChild(handle)

    handle.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault()
        const startY = e.clientY
        const startHeight = panelHeight
        const onMove = (ev: MouseEvent): void => {
            panelHeight = Math.max(TIMELINE_MIN_HEIGHT, Math.min(TIMELINE_MAX_HEIGHT, startHeight + (startY - ev.clientY)))
            onHeightChange(panelHeight)
        }
        const onUp = (): void => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    })

    /* ── 控制条 ── */
    const bar = document.createElement('div')
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;flex-shrink:0;flex-wrap:wrap'
    container.appendChild(bar)

    const playBtn = makeButton()
    playBtn.id = 'bone-timeline-play'
    playBtn.appendChild(createIcon('play', {size: 'sm'}))
    localizeTitle(playBtn, 'bone_edit.timeline.play_pause')
    const stopBtn = makeButton()
    stopBtn.id = 'bone-timeline-stop'
    stopBtn.appendChild(createIcon('stop', {size: 'sm'}))
    localizeTitle(stopBtn, 'bone_edit.timeline.stop')
    const loopCheck = document.createElement('label')
    loopCheck.className = 'dc-label'
    loopCheck.style.cssText = 'display:inline-flex;align-items:center;gap:4px'
    const loopText = document.createElement('span')
    localizeText(loopText, 'bone_edit.timeline.loop')
    loopCheck.appendChild(loopText)
    const loopInput = document.createElement('input')
    loopInput.type = 'checkbox'
    loopInput.className = 'dc-check'
    loopCheck.appendChild(loopInput)

    const animSelect = document.createElement('select')
    animSelect.id = ANIM_SELECT_ID
    animSelect.className = 'dc-select'
    localizeTitle(animSelect, 'bone_edit.timeline.anim_list_title')
    animSelect.style.cssText = 'max-width:200px'
    const newAnimBtn = makeTextButton('bone_edit.timeline.new_anim')
    const delAnimBtn = makeTextButton('bone_edit.timeline.del_anim')
    const renameAnimBtn = makeTextButton('bone_edit.timeline.rename_anim')

    const durationInput = document.createElement('input')
    durationInput.type = 'number'
    durationInput.className = 'dc-input'
    durationInput.step = '0.01'
    durationInput.min = '0.01'
    durationInput.style.width = '60px'
    const speedInput = document.createElement('input')
    speedInput.type = 'number'
    speedInput.className = 'dc-input'
    speedInput.step = '0.1'
    speedInput.min = '0'
    speedInput.style.width = '50px'

    const addKeyBtn = makeTextButton('bone_edit.timeline.add_key', 'bone_edit.timeline.add_key_title')
    const addEventBtn = makeTextButton('bone_edit.timeline.add_event', 'bone_edit.timeline.add_event_title')
    const delKeyBtn = makeTextButton('bone_edit.timeline.del_key', 'bone_edit.timeline.del_key_title')
    const copyBtn = makeTextButton('bone_edit.timeline.copy')
    const pasteBtn = makeTextButton('bone_edit.timeline.paste')
    /* 洋葱皮 / IK 为开合切换按钮：文案在点击时按状态重译（不走 localizeText，避免语言切换覆盖开合态） */
    const onionBtn = makeButton()
    onionBtn.textContent = translate('bone_edit.timeline.onion_off')
    const ikBtn = makeButton()
    ikBtn.textContent = translate('bone_edit.timeline.ik_off')
    localizeTitle(ikBtn, 'bone_edit.timeline.ik_title')
    const undoBtn = makeButton()
    undoBtn.id = 'bone-timeline-undo'
    undoBtn.appendChild(createIcon('undo', {size: 'sm'}))
    localizeTitle(undoBtn, 'bone_edit.timeline.undo')
    const redoBtn = makeButton()
    redoBtn.id = 'bone-timeline-redo'
    redoBtn.appendChild(createIcon('redo', {size: 'sm'}))
    localizeTitle(redoBtn, 'bone_edit.timeline.redo')
    const exportBtn = makeTextButton('bone_edit.timeline.export')
    const importBtn = makeTextButton('bone_edit.timeline.import')

    /* 骨架聚焦下拉 */
    const skeletonSelect = document.createElement('select')
    skeletonSelect.className = 'dc-select'
    skeletonSelect.style.cssText = 'max-width:140px'

    /* 惯用手预览下拉：右撇子 = 原样；左撇子 = 聚焦骨架整体镜像（与游戏内镜像结果一致） */
    const handednessSelect = document.createElement('select')
    handednessSelect.id = HANDEDNESS_SELECT_ID
    handednessSelect.className = 'dc-select'
    localizeTitle(handednessSelect, 'bone_edit.handedness.select_title')
    handednessSelect.style.cssText = 'max-width:100px'
    for (const value of HANDEDNESS) {
        const option = document.createElement('option')
        option.value = value
        localizeText(option, HANDEDNESS_LABELS[value])
        handednessSelect.appendChild(option)
    }

    const durationLabel = document.createElement('span')
    localizeText(durationLabel, 'bone_edit.timeline.duration')
    const speedLabel = document.createElement('span')
    localizeText(speedLabel, 'bone_edit.timeline.speed')
    const skeletonLabel = document.createElement('span')
    localizeText(skeletonLabel, 'bone_edit.timeline.skeleton')
    const handednessLabel = document.createElement('span')
    localizeText(handednessLabel, 'bone_edit.handedness')

    for (const el of [
        playBtn, stopBtn, loopCheck, animSelect, newAnimBtn, renameAnimBtn, delAnimBtn,
        durationLabel, durationInput, speedLabel, speedInput,
        addKeyBtn, addEventBtn, delKeyBtn, copyBtn, pasteBtn, onionBtn, ikBtn, undoBtn, redoBtn,
        exportBtn, importBtn, skeletonLabel, skeletonSelect, handednessLabel, handednessSelect,
    ]) {
        bar.appendChild(el)
    }

    return {
        bar,
        playBtn, stopBtn, loopInput, animSelect, newAnimBtn, renameAnimBtn, delAnimBtn,
        durationInput, speedInput, addKeyBtn, addEventBtn, delKeyBtn, copyBtn, pasteBtn,
        onionBtn, ikBtn, undoBtn, redoBtn, exportBtn, importBtn, skeletonSelect, handednessSelect,
        getHeight: () => panelHeight,
    }
}
