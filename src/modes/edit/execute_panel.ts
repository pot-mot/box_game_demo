/**
 * 编辑模式——执行面板 UI
 * 提供：持续执行（快照/还原）、单步步进、N 步排队执行、重置
 */

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
    executeBtn.textContent = 'Execute'
    executeBtn.title = '持续执行（带快照/还原）'
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
        executeBtn.textContent = isExecuting ? 'Stop' : 'Execute'
        for (const cb of toggleCallbacks) cb(isExecuting)
    })

    /* ── 单步步进按钮 ── */
    const stepBtn = document.createElement('button')
    stepBtn.textContent = 'Step'
    stepBtn.title = "单击推进一步 (1/60s)"
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
    stepInput.title = '输入步数后点击右侧按钮执行'
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
    runStepsBtn.textContent = 'Run'
    runStepsBtn.title = '按输入步数逐帧执行'
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
    resetBtn.textContent = 'Reset'
    resetBtn.title = '停止执行并清空所有实体'
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
            executeBtn.textContent = 'Stop'
        } else if (pendingSteps > 0) {
            executeBtn.style.cssText = STYLES.btn(false) + STYLES.btnDisabled
            executeBtn.style.background = ''
            executeBtn.textContent = 'Execute'
            stepBtn.style.cssText = STYLES.btn(false) + STYLES.btnDisabled
            stepBtn.style.background = ''
            runStepsBtn.style.cssText = STYLES.btn(false) + STYLES.btnDisabled
            runStepsBtn.style.background = ''
        } else {
            executeBtn.textContent = 'Execute'
            executeBtn.style.cssText = STYLES.btn(false)
            stepBtn.style.cssText = STYLES.btn(false)
            runStepsBtn.style.cssText = STYLES.btn(false)
        }
        if (pendingSteps > 0) {
            runStepsBtn.textContent = `Run (${pendingSteps})`
        } else {
            runStepsBtn.textContent = 'Run'
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
