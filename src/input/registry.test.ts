import {describe, it, expect, beforeEach} from 'vitest'
import {createInputRegistry, getInputRegistry} from './registry.ts'
import {DEFAULT_BINDINGS, STORAGE_KEY} from './constants.ts'
import {INPUT_ACTIONS, type BindingsMap, type InputAction, type KeyCombo} from './types.ts'

/** 约定的默认操作配置（与导出的 box_demo_keybindings.json 一致：WASD 移动 + Z/X 升降） */
const EXPECTED_DEFAULTS: Record<InputAction, readonly (readonly string[])[]> = {
    move_forward: [['KeyW']],
    move_backward: [['KeyS']],
    move_left: [['KeyA']],
    move_right: [['KeyD']],
    move_up: [['KeyZ']],
    move_down: [['KeyX']],
    jump: [['Space']],
    roll: [['ShiftLeft'], ['ShiftRight']],
    boost: [['ShiftLeft'], ['ShiftRight']],
    cycle_attack_module: [['ControlLeft'], ['ControlRight']],
    cycle_spawn_up: [['ArrowUp']],
    cycle_spawn_down: [['ArrowDown']],
    delete_entity: [['Delete']],
    close_panel: [['Escape']],
    interact: [['KeyF']],
    open_inventory: [['KeyB']],
    open_equipment: [['KeyE']],
    open_map: [['KeyM']],
    save_world: [['ControlLeft', 'KeyS'], ['MetaLeft', 'KeyS']],
    load_world: [['ControlLeft', 'KeyO'], ['MetaLeft', 'KeyO']],
    toggle_debug_hud: [['Backquote']],
    mouse_orbit: [['Mouse0']],
    mouse_pan: [['Mouse2']],
    spawn_entity: [['ControlLeft', 'Mouse0'], ['ControlRight', 'Mouse0']],
    lock_target: [['Mouse1']],
    attack_light: [['Mouse0']],
    attack_heavy: [['Mouse2']],
    showcase_focus: [['Mouse0']],
}

/** 克隆默认绑定为可变映射（测试内构造绑定用例） */
const cloneDefaults = (): BindingsMap => {
    const copy = {} as BindingsMap
    for (const action of INPUT_ACTIONS) {
        copy[action] = DEFAULT_BINDINGS[action].map(c => [...c])
    }
    return copy
}

const mouseEvent = (type: string, button: number): MouseEvent =>
    new MouseEvent(type, {button, bubbles: true, cancelable: true})

describe('输入注册表：默认绑定', () => {
    beforeEach(() => {
        localStorage.clear()
        createInputRegistry()
    })

    it('默认绑定等于约定的默认操作配置', () => {
        const bindings = getInputRegistry().getBindings()
        expect(bindings).toEqual(EXPECTED_DEFAULTS)
        /* 每个动作都必须有绑定（导入校验同样要求非空） */
        for (const action of INPUT_ACTIONS) {
            expect(bindings[action].length).toBeGreaterThan(0)
        }
    })
})

describe('输入注册表：旧版本绑定记录', () => {
    beforeEach(() => {
        localStorage.clear()
        createInputRegistry()
    })

    it('缺少新增动作时保留其余绑定并用默认值补齐', () => {
        const legacy: Record<string, unknown> = {}
        for (const action of INPUT_ACTIONS) {
            /* 模拟加入 lock_target 之前保存的记录 */
            if (action === 'lock_target') continue
            legacy[action] = DEFAULT_BINDINGS[action].map(c => [...c])
        }
        legacy.jump = [['KeyJ']]
        localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy))

        createInputRegistry()
        const bindings = getInputRegistry().getBindings()
        expect(bindings.jump).toEqual([['KeyJ']])
        expect(bindings.lock_target).toEqual([['Mouse1']])
    })

    it('结构损坏的记录整体回退默认值', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({jump: 'KeyJ'}))

        createInputRegistry()
        expect(getInputRegistry().getBindings()).toEqual(DEFAULT_BINDINGS)
    })
})

describe('输入注册表：鼠标绑定', () => {
    beforeEach(() => {
        localStorage.clear()
        createInputRegistry()
    })

    it('默认绑定中鼠标动作按按键码命中', () => {
        const input = getInputRegistry()
        expect(input.matchesMouseButton('mouse_orbit', 0)).toBe(true)
        expect(input.matchesMouseButton('mouse_orbit', 2)).toBe(false)
        expect(input.matchesMouseButton('mouse_pan', 2)).toBe(true)
        expect(input.matchesMouseButton('spawn_entity', 0)).toBe(false)
        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'ControlLeft'}))
        expect(input.matchesMouseButton('spawn_entity', 0)).toBe(true)
        expect(input.matchesMouseButton('spawn_entity', 2)).toBe(false)
        expect(input.matchesMouseButton('lock_target', 1)).toBe(true)
        expect(input.matchesMouseButton('lock_target', 0)).toBe(false)
    })

    it('鼠标捕获：按下再松开左键得到 Mouse0 组合', () => {
        const input = getInputRegistry()
        let captured: KeyCombo | undefined
        input.setInputCapture((combo) => { captured = combo })

        window.dispatchEvent(mouseEvent('mousedown', 0))
        expect(captured).toBeUndefined()
        window.dispatchEvent(mouseEvent('mouseup', 0))

        expect(captured).toEqual(['Mouse0'])
    })

    it('键盘捕获：按键松开后得到键码组合', () => {
        const input = getInputRegistry()
        let captured: KeyCombo | undefined
        input.setInputCapture((combo) => { captured = combo })

        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyK'}))
        window.dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyK'}))

        expect(captured).toEqual(['KeyK'])
    })

    it('含修饰键的组合需要修饰键同时按下', () => {
        const input = getInputRegistry()
        const bindings = cloneDefaults()
        bindings.mouse_orbit = [['AltLeft', 'Mouse2']]
        input.setBindings(bindings)

        expect(input.matchesMouseButton('mouse_orbit', 2)).toBe(false)
        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'AltLeft'}))
        expect(input.matchesMouseButton('mouse_orbit', 2)).toBe(true)
    })

})

describe('输入注册表：Tab 焦点切换拦截', () => {
    beforeEach(() => {
        localStorage.clear()
        createInputRegistry()
    })

    it('焦点在游戏画面（body）时拦截 Tab 默认行为', () => {
        const event = new KeyboardEvent('keydown', {code: 'Tab', bubbles: true, cancelable: true})
        window.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
    })

    it('焦点在表单控件内时保留 Tab 默认行为', () => {
        const field = document.createElement('input')
        document.body.appendChild(field)
        const event = new KeyboardEvent('keydown', {code: 'Tab', bubbles: true, cancelable: true})
        field.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
        field.remove()
    })
})

describe('输入注册表：交互控件焦点隔离', () => {
    beforeEach(() => {
        localStorage.clear()
        createInputRegistry()
    })

    const focusedControl = (tag: 'input' | 'select' | 'textarea'): HTMLElement => {
        const control = document.createElement(tag)
        document.body.appendChild(control)
        control.focus()
        return control
    }

    it('焦点在输入框 / select / 文本域内时不响应字母键与方向键', () => {
        const input = getInputRegistry()
        for (const tag of ['input', 'select', 'textarea'] as const) {
            const control = focusedControl(tag)

            const letter = new KeyboardEvent('keydown', {code: 'KeyA', bubbles: true, cancelable: true})
            control.dispatchEvent(letter)
            expect(letter.defaultPrevented, tag).toBe(false)
            expect(input.isActionActive('move_left'), tag).toBe(false)

            const arrow = new KeyboardEvent('keydown', {code: 'ArrowUp', bubbles: true, cancelable: true})
            control.dispatchEvent(arrow)
            expect(arrow.defaultPrevented, tag).toBe(false)
            expect(input.isActionActive('cycle_spawn_up'), tag).toBe(false)

            control.remove()
        }
    })

    it('按住移动键后焦点进入输入框，立即清空按住状态', () => {
        const input = getInputRegistry()
        window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW', bubbles: true}))
        expect(input.isActionActive('move_forward')).toBe(true)

        const field = document.createElement('input')
        document.body.appendChild(field)
        field.dispatchEvent(new FocusEvent('focusin', {bubbles: true}))

        expect(input.isActionActive('move_forward')).toBe(false)
        field.remove()
    })

    it('按钮聚焦时空格 / 回车让位给原生激活，不触发游戏跳跃', () => {
        const input = getInputRegistry()
        const button = document.createElement('button')
        document.body.appendChild(button)
        button.focus()

        const space = new KeyboardEvent('keydown', {code: 'Space', bubbles: true, cancelable: true})
        button.dispatchEvent(space)
        expect(space.defaultPrevented).toBe(false)
        expect(input.isActionActive('jump')).toBe(false)

        const enter = new KeyboardEvent('keydown', {code: 'Enter', bubbles: true, cancelable: true})
        button.dispatchEvent(enter)
        expect(enter.defaultPrevented).toBe(false)
        button.remove()
    })

    it('交互控件内按 Escape 仍保留关闭面板的全局退路', () => {
        const input = getInputRegistry()
        let closed = false
        input.onActionDown('close_panel', () => { closed = true })

        const field = focusedControl('input')
        const event = new KeyboardEvent('keydown', {code: 'Escape', bubbles: true, cancelable: true})
        field.dispatchEvent(event)

        expect(closed).toBe(true)
        expect(event.defaultPrevented).toBe(true)
        field.remove()
    })

    it('重绑捕获优先于焦点隔离', () => {
        const input = getInputRegistry()
        let captured: KeyCombo | undefined
        input.setInputCapture(combo => { captured = combo })

        const button = document.createElement('button')
        document.body.appendChild(button)
        button.focus()
        button.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyK', bubbles: true}))
        button.dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyK', bubbles: true}))

        expect(captured).toEqual(['KeyK'])
        button.remove()
    })
})
