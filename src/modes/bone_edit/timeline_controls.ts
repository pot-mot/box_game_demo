import {ANIM_SELECT_ID, TIMELINE_MAX_HEIGHT, TIMELINE_MIN_HEIGHT} from './constants.ts'

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

const makeButton = (label: string, title = ''): HTMLButtonElement => {
    const b = document.createElement('button')
    b.textContent = label
    b.title = title
    b.style.cssText = 'padding:2px 8px;cursor:pointer;background:#2a2a33;color:#ddd;border:1px solid #444;border-radius:3px'
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
    handle.title = '拖拽调节高度'
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

    const playBtn = makeButton('▶', '播放/暂停')
    const stopBtn = makeButton('■', '停止')
    const loopCheck = document.createElement('label')
    loopCheck.textContent = '循环 '
    const loopInput = document.createElement('input')
    loopInput.type = 'checkbox'
    loopCheck.appendChild(loopInput)

    const animSelect = document.createElement('select')
    animSelect.id = ANIM_SELECT_ID
    animSelect.title = '动画列表：编辑动画 + 内置动作（攻击/行走/跳跃等，选中载入可编辑副本）'
    animSelect.style.cssText = 'max-width:200px'
    const newAnimBtn = makeButton('+动画')
    const delAnimBtn = makeButton('−动画')
    const renameAnimBtn = makeButton('改名')

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

    const addKeyBtn = makeButton('+关键帧', '把当前姿态记录到播放头时间（选中目标或全部）')
    const addEventBtn = makeButton('+事件', '在播放头时间插入事件（默认 hitbox_on）')
    const delKeyBtn = makeButton('−关键帧', '删除选中关键帧')
    const copyBtn = makeButton('复制')
    const pasteBtn = makeButton('粘贴')
    const onionBtn = makeButton('洋葱皮')
    const ikBtn = makeButton('IK 关', 'IK 牵引模式切换')
    const undoBtn = makeButton('↶')
    const redoBtn = makeButton('↷')
    const exportBtn = makeButton('导出')
    const importBtn = makeButton('导入')

    /* 骨架聚焦下拉 */
    const skeletonSelect = document.createElement('select')
    skeletonSelect.style.cssText = 'max-width:140px'

    for (const el of [
        playBtn, stopBtn, loopCheck, animSelect, newAnimBtn, renameAnimBtn, delAnimBtn,
        document.createTextNode('时长'), durationInput, document.createTextNode('速度'), speedInput,
        addKeyBtn, addEventBtn, delKeyBtn, copyBtn, pasteBtn, onionBtn, ikBtn, undoBtn, redoBtn,
        exportBtn, importBtn, document.createTextNode('骨架'), skeletonSelect,
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
