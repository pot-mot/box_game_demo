import {ANIM_SELECT_ID, TIMELINE_MAX_HEIGHT, TIMELINE_MIN_HEIGHT} from './constants.ts'
import {translate, type StringLocaleKey} from '../../i18n/index.ts'
import {localizeText, localizeTitle} from '../../i18n/dom.ts'

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
    /** 当前面板高度（px，拖拽顶边改变） */
    readonly getHeight: () => number
}

const BUTTON_STYLE = 'padding:2px 8px;cursor:pointer;background:#2a2a33;color:#ddd;border:1px solid #444;border-radius:3px'

/** 创建控制条按钮（内容与标题由调用方本地化） */
const makeButton = (): HTMLButtonElement => {
    const b = document.createElement('button')
    b.style.cssText = BUTTON_STYLE
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
    handle.style.cssText = 'height:6px;cursor:ns-resize;background:#333;flex-shrink:0'
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
    playBtn.textContent = '▶'
    localizeTitle(playBtn, 'bone_edit.timeline.play_pause')
    const stopBtn = makeButton()
    stopBtn.textContent = '■'
    localizeTitle(stopBtn, 'bone_edit.timeline.stop')
    const loopCheck = document.createElement('label')
    const loopText = document.createElement('span')
    localizeText(loopText, 'bone_edit.timeline.loop')
    loopCheck.appendChild(loopText)
    const loopInput = document.createElement('input')
    loopInput.type = 'checkbox'
    loopCheck.appendChild(loopInput)

    const animSelect = document.createElement('select')
    animSelect.id = ANIM_SELECT_ID
    localizeTitle(animSelect, 'bone_edit.timeline.anim_list_title')
    animSelect.style.cssText = 'max-width:200px'
    const newAnimBtn = makeTextButton('bone_edit.timeline.new_anim')
    const delAnimBtn = makeTextButton('bone_edit.timeline.del_anim')
    const renameAnimBtn = makeTextButton('bone_edit.timeline.rename_anim')

    const durationInput = document.createElement('input')
    durationInput.type = 'number'
    durationInput.step = '0.01'
    durationInput.min = '0.01'
    durationInput.style.width = '60px'
    const speedInput = document.createElement('input')
    speedInput.type = 'number'
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
    undoBtn.textContent = '↶'
    localizeTitle(undoBtn, 'bone_edit.timeline.undo')
    const redoBtn = makeButton()
    redoBtn.textContent = '↷'
    localizeTitle(redoBtn, 'bone_edit.timeline.redo')
    const exportBtn = makeTextButton('bone_edit.timeline.export')
    const importBtn = makeTextButton('bone_edit.timeline.import')

    /* 骨架聚焦下拉 */
    const skeletonSelect = document.createElement('select')
    skeletonSelect.style.cssText = 'max-width:140px'

    const durationLabel = document.createElement('span')
    localizeText(durationLabel, 'bone_edit.timeline.duration')
    const speedLabel = document.createElement('span')
    localizeText(speedLabel, 'bone_edit.timeline.speed')
    const skeletonLabel = document.createElement('span')
    localizeText(skeletonLabel, 'bone_edit.timeline.skeleton')

    for (const el of [
        playBtn, stopBtn, loopCheck, animSelect, newAnimBtn, renameAnimBtn, delAnimBtn,
        durationLabel, durationInput, speedLabel, speedInput,
        addKeyBtn, addEventBtn, delKeyBtn, copyBtn, pasteBtn, onionBtn, ikBtn, undoBtn, redoBtn,
        exportBtn, importBtn, skeletonLabel, skeletonSelect,
    ]) {
        bar.appendChild(el)
    }

    return {
        bar,
        playBtn, stopBtn, loopInput, animSelect, newAnimBtn, renameAnimBtn, delAnimBtn,
        durationInput, speedInput, addKeyBtn, addEventBtn, delKeyBtn, copyBtn, pasteBtn,
        onionBtn, ikBtn, undoBtn, redoBtn, exportBtn, importBtn, skeletonSelect,
        getHeight: () => panelHeight,
    }
}
