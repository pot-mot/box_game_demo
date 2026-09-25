import {describe, it, expect, beforeEach} from 'vitest'
import {setupExecutePanel, type ExecutePanel} from './execute_panel.ts'

/** 重新挂载一个新面板（清空 body，避免多个同 id 容器互相干扰） */
const createPanel = (): ExecutePanel => {
    document.body.innerHTML = ''
    return setupExecutePanel()
}

/** 面板按钮：按挂载顺序取 [Execute/Stop, Step, Run, Reset] */
const getButtons = (): HTMLButtonElement[] => Array.from(
    document.querySelectorAll<HTMLButtonElement>('#execute-panel button'),
)

const click = (btn: HTMLButtonElement | undefined): void => {
    if (!btn) throw new Error('按钮不存在')
    btn.click()
}

/** 记录 onToggle / onReset 派发情况的探针 */
const createProbe = (panel: ExecutePanel): {toggles: boolean[]; resets: number} => {
    const state = {toggles: [] as boolean[], resets: 0}
    panel.onToggle((entering: boolean) => { state.toggles.push(entering) })
    panel.onReset(() => { state.resets += 1 })
    return state
}

describe('执行面板：交互状态', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('初始态：未执行、无排队步进，五个控件齐全', () => {
        const panel = createPanel()
        expect(panel.isExecuting()).toBe(false)
        expect(panel.pendingSteps()).toBe(0)
        const buttons = getButtons()
        expect(buttons).toHaveLength(4)
        expect(buttons[0].textContent).toBe('Execute')
        expect(buttons[1].textContent).toBe('Step')
        expect(buttons[3].textContent).toBe('Reset')
    })

    it('Execute 切到执行态，再次点击（Stop）切回暂停态', () => {
        const panel = createPanel()
        const probe = createProbe(panel)
        const [executeBtn] = getButtons()

        click(executeBtn)
        expect(panel.isExecuting()).toBe(true)
        expect(probe.toggles).toEqual([true])
        panel.update()
        expect(getButtons()[0].textContent).toBe('Stop')

        click(executeBtn)
        expect(panel.isExecuting()).toBe(false)
        expect(probe.toggles).toEqual([true, false])
        panel.update()
        expect(getButtons()[0].textContent).toBe('Execute')
    })

    it('Stop 只派发 onToggle(false)，不派发 onReset（还原唯一入口是 Reset）', () => {
        const panel = createPanel()
        const probe = createProbe(panel)
        const [executeBtn] = getButtons()

        click(executeBtn)
        click(executeBtn)

        expect(probe.toggles).toEqual([true, false])
        expect(probe.resets).toBe(0)
        /* 停止后排队步进应可用（世界已冻结，可继续单步） */
        click(getButtons()[1])
        expect(panel.pendingSteps()).toBe(1)
    })

    it('Reset 派发 onReset，并由订阅者负责执行态复位（面板不重复派发 onToggle）', () => {
        const panel = createPanel()
        const probe = createProbe(panel)
        const [executeBtn, , , resetBtn] = getButtons()

        click(executeBtn)
        click(resetBtn)

        expect(probe.resets).toBe(1)
        expect(probe.toggles).toEqual([true])
        expect(panel.isExecuting()).toBe(false)
        panel.update()
        expect(getButtons()[0].textContent).toBe('Execute')
    })

    it('Reset 清空排队步进', () => {
        const panel = createPanel()
        const [, stepBtn, , resetBtn] = getButtons()

        click(stepBtn)
        click(stepBtn)
        expect(panel.pendingSteps()).toBe(2)

        click(resetBtn)
        expect(panel.pendingSteps()).toBe(0)
    })

    it('排队步进期间 Execute 不可用（点击无效、不派发 onToggle）', () => {
        const panel = createPanel()
        const probe = createProbe(panel)
        const [executeBtn, stepBtn] = getButtons()

        click(stepBtn)
        click(executeBtn)

        expect(probe.toggles).toEqual([])
        expect(panel.isExecuting()).toBe(false)
        panel.update()
        expect(getButtons()[0].textContent).toBe('Execute')
    })

    it('执行中 Step / Run 点击无效', () => {
        const panel = createPanel()
        const [executeBtn, stepBtn, runBtn] = getButtons()

        click(executeBtn)
        click(stepBtn)
        click(runBtn)

        expect(panel.pendingSteps()).toBe(0)
    })

    it('Run 按输入框步数排队，consumeStep 逐帧递减且不为负', () => {
        const panel = createPanel()
        const runBtn = getButtons()[2]
        const input = document.querySelector<HTMLInputElement>('#execute-panel input')
        expect(input).not.toBeNull()
        if (!input) return
        input.value = '3'

        click(runBtn)
        expect(panel.pendingSteps()).toBe(3)

        panel.consumeStep()
        panel.consumeStep()
        panel.consumeStep()
        panel.consumeStep()
        expect(panel.pendingSteps()).toBe(0)
    })

    it('forceStop 停止执行并清空排队；未执行时不派发 onToggle', () => {
        const panel = createPanel()
        const probe = createProbe(panel)
        const [, stepBtn] = getButtons()

        /* 排队步进被清空，未执行时不派发 onToggle */
        click(stepBtn)
        click(stepBtn)
        panel.forceStop()
        expect(panel.pendingSteps()).toBe(0)
        expect(probe.toggles).toEqual([])

        /* 执行态被停止并派发 onToggle(false) */
        click(getButtons()[0])
        expect(panel.isExecuting()).toBe(true)
        panel.forceStop()
        expect(panel.isExecuting()).toBe(false)
        expect(probe.toggles).toEqual([true, false])
    })
})
