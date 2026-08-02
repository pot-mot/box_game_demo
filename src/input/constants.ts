import type {BindingsMap, KeyCombo, InputAction} from './types.ts'
import {INPUT_ACTIONS} from './types.ts'

/** 默认按键绑定 */
export const DEFAULT_BINDINGS: BindingsMap = {
    move_forward: [['KeyW']],
    move_backward: [['KeyS']],
    move_left: [['KeyA']],
    move_right: [['KeyD']],
    move_up: [['KeyE']],
    move_down: [['KeyQ']],
    jump: [['Space']],
    sprint: [['ShiftLeft'], ['ShiftRight']],
    cycle_spawn_up: [['ArrowUp']],
    cycle_spawn_down: [['ArrowDown']],
    delete_entity: [['Delete']],
    close_panel: [['Escape']],
    toggle_help: [['F1']],
    save_world: [['ControlLeft', 'KeyS'], ['MetaLeft', 'KeyS']],
    load_world: [['ControlLeft', 'KeyO'], ['MetaLeft', 'KeyO']],
}

/** KeyboardEvent.code → 可读键名映射 */
export const CODE_LABELS: Record<string, string> = {
    // 字母
    KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E',
    KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyI: 'I', KeyJ: 'J',
    KeyK: 'K', KeyL: 'L', KeyM: 'M', KeyN: 'N', KeyO: 'O',
    KeyP: 'P', KeyQ: 'Q', KeyR: 'R', KeyS: 'S', KeyT: 'T',
    KeyU: 'U', KeyV: 'V', KeyW: 'W', KeyX: 'X', KeyY: 'Y', KeyZ: 'Z',
    // 数字
    Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
    Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
    // 功能键
    F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5',
    F6: 'F6', F7: 'F7', F8: 'F8', F9: 'F9',
    F10: 'F10', F11: 'F11', F12: 'F12',
    // 修饰键
    ShiftLeft: 'LShift', ShiftRight: 'RShift',
    ControlLeft: 'Ctrl', ControlRight: 'RCtrl',
    AltLeft: 'Alt', AltRight: 'RAlt',
    MetaLeft: 'Meta', MetaRight: 'RMeta',
    // 导航
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    // 编辑键
    Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins',
    Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
    // 特殊
    Space: 'Space', Enter: 'Enter', Escape: 'Esc',
    Tab: 'Tab', CapsLock: 'Caps', NumLock: 'NumLk', ScrollLock: 'ScrLk',
    // 小键盘
    Numpad0: 'Num0', Numpad1: 'Num1', Numpad2: 'Num2', Numpad3: 'Num3', Numpad4: 'Num4',
    Numpad5: 'Num5', Numpad6: 'Num6', Numpad7: 'Num7', Numpad8: 'Num8', Numpad9: 'Num9',
    NumpadAdd: 'Num+', NumpadSubtract: 'Num-', NumpadMultiply: 'Num*', NumpadDivide: 'Num/',
    NumpadDecimal: 'Num.', NumpadEnter: 'NumEnter',
    // 标点
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: '\'',
    Comma: ',', Period: '.', Slash: '/',
    Backquote: '`',
}

/**
 * 比较两个 KeyCombo 是否相等。
 * 两个排序好的 combo 直接逐元素比较。
 */
export const combosEqual = (a: KeyCombo, b: KeyCombo): boolean => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

/**
 * 在当前绑定中查找与给定 combo 冲突的条目。
 * 返回冲突动作名称，无冲突返回 undefined。
 * excludeAction 用于排除正在编辑的动作本身。
 */
export const findConflict = (
    bindings: { readonly [K in InputAction]: readonly (readonly string[])[] },
    combo: KeyCombo,
    excludeAction?: InputAction,
): InputAction | undefined => {
    for (const action of INPUT_ACTIONS) {
        if (action === excludeAction) continue
        const combos = bindings[action]
        for (const existing of combos) {
            if (combosEqual(existing, combo)) {
                return action
            }
        }
    }
    return undefined
}

/** localStorage 键名 */
export const STORAGE_KEY = 'box_demo_keybindings'
