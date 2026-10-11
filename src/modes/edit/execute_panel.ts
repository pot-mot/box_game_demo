/**
 * 编辑模式——执行面板 UI
 * 提供：持续执行（Execute / Stop）、单步步进（Step）、N 步排队执行（Run）、重置（Reset）
 *
 * 语义约定（面板只负责交互状态，世界快照由 main.ts 持有）：
 * - Execute：开始步进；世界尚未步进过时把当前编辑状态记为还原基线（onToggle(true)）；
 * - Stop：仅停止世界步进，世界保持当前状态，**不触发还原**（onToggle(false)）；
 * - Reset：唯一的世界还原入口（onReset），停止步进并回到最近一次基线。
 * 面板自身置停时不再派发 onToggle(false)，由 onReset 订阅者统一处理执行态复位。
 */

import {translate} from '../../i18n/index.ts'

type ToggleCallback = (entering: boolean) => void
type ResetCallback = () => void

export interface ExecutePanel {
    readonly update: () => void
    readonly isExecuting: () => boolean
    readonly pendingSteps: () => number
    onToggle: (cb: ToggleCallback) => void
    onReset: (cb: ResetCallback) => void
    enqueueSteps: (n: number) => void
    consumeStep: () => void
    forceStop: () => void
}

/** 设置按钮的主题态：主操作（执行中）/ 禁用 */
const setButtonState = (btn: HTMLButtonElement, active: boolean, disabled: boolean): void => {
    btn.classList.toggle('dc-btn--primary', active && !disabled)
    btn.classList.toggle('is-disabled', disabled)
}

export const setupExecutePanel = (): ExecutePanel => {
    let isExecuting = false
    let pendingSteps = 0
    const toggleCallbacks: ToggleCallback[] = []
    const resetCallbacks: ResetCallback[] = []

    const container = document.createElement('div')
    container.id = 'execute-panel'
    container.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;user-select:none;z-index:100;'

    /* ── 执行 / 停止按钮 ── */
    const executeBtn = document.createElement('button')
    executeBtn.className = 'dc-btn'
    executeBtn.textContent = translate('edit.execute')
    executeBtn.title = translate('edit.title.execute_start')
    executeBtn.addEventListener('click', () => {
        if (pendingSteps > 0) return
        isExecuting = !isExecuting
        executeBtn.textContent = isExecuting ? translate('edit.stop') : translate('edit.execute')
        for (const cb of toggleCallbacks) cb(isExecuting)
    })

    /* ── 单步步进按钮 ── */
    const stepBtn = document.createElement('button')
    stepBtn.className = 'dc-btn'
    stepBtn.textContent = translate('edit.step')
    stepBtn.title = translate('edit.title.step')
    stepBtn.addEventListener('click', () => {
        if (isExecuting) return
        pendingSteps += 1
    })

    /* ── 步数输入 ── */
    const stepInput = document.createElement('input')
    stepInput.type = 'text'
    stepInput.value = '60'
    stepInput.className = 'dc-input'
    stepInput.style.cssText = 'width:48px;text-align:center'
    stepInput.title = translate('edit.title.input')
    stepInput.addEventListener('input', () => {
        stepInput.value = stepInput.value.replace(/\D/g, '')
        if (stepInput.value === '') stepInput.value = '1'
    })
    stepInput.addEventListener('wheel', (e: Event) => {
        e.preventDefault()
        const ev = e as WheelEvent
        const cur = parseInt(stepInput.value, 10) || 1
        const next = cur + (ev.deltaY < 0 ? 1 : -1)
        stepInput.value = String(Math.max(1, next))
    })

    /* ── 执行 N 步按钮 ── */
    const runStepsBtn = document.createElement('button')
    runStepsBtn.className = 'dc-btn'
    runStepsBtn.textContent = translate('edit.run')
    runStepsBtn.title = translate('edit.title.run')
    runStepsBtn.addEventListener('click', () => {
        if (isExecuting) return
        const n = parseInt(stepInput.value, 10) || 1
        pendingSteps += n
    })

    /* ── 重置按钮 ── */
    const resetBtn = document.createElement('button')
    resetBtn.textContent = translate('edit.reset')
    resetBtn.title = translate('edit.title.reset')
    resetBtn.className = 'dc-btn'
    const triggerReset = (): void => {
        if (isExecuting) {
            isExecuting = false
        }
        pendingSteps = 0
        for (const cb of resetCallbacks) cb()
    }
    resetBtn.addEventListener('click', triggerReset)

    container.appendChild(executeBtn)
    container.appendChild(stepBtn)
    container.appendChild(stepInput)
    container.appendChild(runStepsBtn)
    container.appendChild(resetBtn)
    document.body.appendChild(container)

    const update = (): void => {
        if (isExecuting) {
            setButtonState(executeBtn, true, false)
            setButtonState(stepBtn, false, true)
            setButtonState(runStepsBtn, false, true)
            executeBtn.textContent = translate('edit.stop')
            executeBtn.title = translate('edit.title.execute_stop')
        } else if (pendingSteps > 0) {
            setButtonState(executeBtn, false, true)
            executeBtn.textContent = translate('edit.execute')
            executeBtn.title = translate('edit.title.execute_pending')
            setButtonState(stepBtn, false, true)
            setButtonState(runStepsBtn, false, true)
        } else {
            setButtonState(executeBtn, false, false)
            executeBtn.textContent = translate('edit.execute')
            executeBtn.title = translate('edit.title.execute_start')
            setButtonState(stepBtn, false, false)
            setButtonState(runStepsBtn, false, false)
        }
        if (pendingSteps > 0) {
            runStepsBtn.textContent = translate({key: 'edit.run_n', args: [String(pendingSteps)]})
        } else {
            runStepsBtn.textContent = translate('edit.run')
        }
    }

    return {
        update,
        isExecuting: () => isExecuting,
        pendingSteps: () => pendingSteps,
        onToggle: (cb: ToggleCallback) => { toggleCallbacks.push(cb) },
        onReset: (cb: ResetCallback) => { resetCallbacks.push(cb) },
        enqueueSteps: (n: number) => { pendingSteps += n },
        consumeStep: () => { if (pendingSteps > 0) pendingSteps-- },
        forceStop: () => {
            if (isExecuting) {
                isExecuting = false
                for (const cb of toggleCallbacks) cb(false)
            }
            pendingSteps = 0
        },
    }
}
