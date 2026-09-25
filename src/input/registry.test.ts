import {describe, it, expect, beforeEach} from 'vitest'
import {createInputRegistry, getInputRegistry} from './registry.ts'
import {DEFAULT_BINDINGS} from './constants.ts'
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
    sprint: [['ShiftLeft'], ['ShiftRight']],
    cycle_spawn_up: [['ArrowUp']],
    cycle_spawn_down: [['ArrowDown']],
    delete_entity: [['Delete']],
    close_panel: [['Escape']],
    save_world: [['ControlLeft', 'KeyS'], ['MetaLeft', 'KeyS']],
    load_world: [['ControlLeft', 'KeyO'], ['MetaLeft', 'KeyO']],
    mouse_orbit: [['Mouse0']],
    mouse_pan: [['Mouse2']],
    spawn_entity: [['Mouse2']],
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
        expect(input.matchesMouseButton('spawn_entity', 2)).toBe(true)
        expect(input.matchesMouseButton('spawn_entity', 0)).toBe(false)
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
