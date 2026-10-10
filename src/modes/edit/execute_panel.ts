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

const STYLES = {
    container: [
        'position: fixed; top: 16px; left: 50%;',
        'transform: translateX(-50%);',
        'font: 14px/1.6 monospace;',
        'display: flex; gap: 8px;',
        'user-select: none; z-index: 100;',
    ].join(' '),
    btn: (active: boolean): string => [
        'padding: 8px 16px; border: none; border-radius: 8px;',
        'cursor: pointer; font: 14px/1.6 monospace;',
        'transition: background .15s;',
        active
            ? 'background: rgba(255,80,80,.85); color: #fff;'
            : 'background: rgba(0,0,0,.7); color: #fff;',
    ].join(' '),
    btnHover: (active: boolean): string => active
        ? 'rgba(255,100,100,.9)'
        : 'rgba(255,255,255,.15)',
    btnDisabled: 'opacity: .4; cursor: default;',
    input: [
        'width: 48px; padding: 8px; border: none; border-radius: 8px;',
        'background: rgba(0,0,0,.7); color: #fff;',
        'font: 14px/1.6 monospace; text-align: center;',
    ].join(' '),
}

export const setupExecutePanel = (): ExecutePanel => {
    let isExecuting = false
    let pendingSteps = 0
    const toggleCallbacks: ToggleCallback[] = []
    const resetCallbacks: ResetCallback[] = []

    const container = document.createElement('div')
    container.id = 'execute-panel'
    container.style.cssText = STYLES.container

    /* ── 执行 / 停止按钮 ── */
    const executeBtn = document.createElement('button')
    executeBtn.textContent = translate('edit.execute')
    executeBtn.title = translate('edit.title.execute_start')
    executeBtn.style.cssText = STYLES.btn(false)
    executeBtn.addEventListener('mouseenter', () => {
        executeBtn.style.background = STYLES.btnHover(isExecuting)
    })
    executeBtn.addEventListener('mouseleave', () => {
        executeBtn.style.cssText = STYLES.btn(isExecuting)
    })
    executeBtn.addEventListener('click', () => {
        if (pendingSteps > 0) return
        isExecuting = !isExecuting
        executeBtn.textContent = isExecuting ? translate('edit.stop') : translate('edit.execute')
        for (const cb of toggleCallbacks) cb(isExecuting)
    })

    /* ── 单步步进按钮 ── */
    const stepBtn = document.createElement('button')
    stepBtn.textContent = translate('edit.step')
    stepBtn.title = translate('edit.title.step')
    stepBtn.style.cssText = STYLES.btn(false)
    stepBtn.addEventListener('mouseenter', () => {
        if (!isExecuting) stepBtn.style.background = STYLES.btnHover(false)
    })
    stepBtn.addEventListener('mouseleave', () => {
        stepBtn.style.cssText = isExecuting ? STYLES.btn(false) + STYLES.btnDisabled : STYLES.btn(false)
        if (isExecuting) stepBtn.style.background = ''
    })
    stepBtn.addEventListener('click', () => {
        if (isExecuting) return
        pendingSteps += 1
    })

    /* ── 步数输入 ── */
    const stepInput = document.createElement('input')
    stepInput.type = 'text'
    stepInput.value = '60'
    stepInput.style.cssText = STYLES.input
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
    runStepsBtn.textContent = translate('edit.run')
    runStepsBtn.title = translate('edit.title.run')
    runStepsBtn.style.cssText = STYLES.btn(false)
    runStepsBtn.addEventListener('mouseenter', () => {
        if (!isExecuting) runStepsBtn.style.background = STYLES.btnHover(false)
    })
    runStepsBtn.addEventListener('mouseleave', () => {
        runStepsBtn.style.cssText = isExecuting ? STYLES.btn(false) + STYLES.btnDisabled : STYLES.btn(false)
        if (isExecuting) runStepsBtn.style.background = ''
    })
    runStepsBtn.addEventListener('click', () => {
        if (isExecuting) return
        const n = parseInt(stepInput.value, 10) || 1
        pendingSteps += n
    })

    /* ── 重置按钮 ── */
    const resetBtn = document.createElement('button')
    resetBtn.textContent = translate('edit.reset')
    resetBtn.title = translate('edit.title.reset')
    resetBtn.style.cssText = STYLES.btn(false)
    const triggerReset = (): void => {
        if (isExecuting) {
            isExecuting = false
        }
        pendingSteps = 0
        for (const cb of resetCallbacks) cb()
    }
    resetBtn.addEventListener('mouseenter', () => {
        resetBtn.style.background = STYLES.btnHover(false)
    })
    resetBtn.addEventListener('mouseleave', () => {
        resetBtn.style.cssText = STYLES.btn(false)
    })
    resetBtn.addEventListener('click', triggerReset)

    container.appendChild(executeBtn)
    container.appendChild(stepBtn)
    container.appendChild(stepInput)
    container.appendChild(runStepsBtn)
    container.appendChild(resetBtn)
    document.body.appendChild(container)

    const update = (): void => {
        if (isExecuting) {
            stepBtn.style.cssText = STYLES.btn(false) + STYLES.btnDisabled
            stepBtn.style.background = ''
            runStepsBtn.style.cssText = STYLES.btn(false) + STYLES.btnDisabled
            runStepsBtn.style.background = ''
            executeBtn.style.cssText = STYLES.btn(true)
            executeBtn.textContent = translate('edit.stop')
            executeBtn.title = translate('edit.title.execute_stop')
        } else if (pendingSteps > 0) {
            executeBtn.style.cssText = STYLES.btn(false) + STYLES.btnDisabled
            executeBtn.style.background = ''
            executeBtn.textContent = translate('edit.execute')
            executeBtn.title = translate('edit.title.execute_pending')
            stepBtn.style.cssText = STYLES.btn(false) + STYLES.btnDisabled
            stepBtn.style.background = ''
            runStepsBtn.style.cssText = STYLES.btn(false) + STYLES.btnDisabled
            runStepsBtn.style.background = ''
        } else {
            executeBtn.textContent = translate('edit.execute')
            executeBtn.title = translate('edit.title.execute_start')
            executeBtn.style.cssText = STYLES.btn(false)
            stepBtn.style.cssText = STYLES.btn(false)
            runStepsBtn.style.cssText = STYLES.btn(false)
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
