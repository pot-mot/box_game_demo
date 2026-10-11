import type {BindingsMap, KeyCombo, InputAction} from './types.ts'
import {INPUT_ACTIONS} from './types.ts'
import type {StringLocaleKey} from '../i18n/index.ts'

/** 默认按键绑定 */
export const DEFAULT_BINDINGS: BindingsMap = {
    move_forward: [['KeyW']],
    move_backward: [['KeyS']],
    move_left: [['KeyA']],
    move_right: [['KeyD']],
    move_up: [['KeyZ']],
    move_down: [['KeyX']],
    jump: [['Space']],
    /* 玩家主控翻滚 / 纯摄像机自由飞行加速：默认均为 Shift */
    roll: [['ShiftLeft'], ['ShiftRight']],
    boost: [['ShiftLeft'], ['ShiftRight']],
    /* 持握模式切换：默认 Ctrl（仅 Ctrl 单独按下时生效；Ctrl+S / Ctrl+O 被更长组合遮蔽，不会误触发） */
    cycle_hold_mode: [['ControlLeft'], ['ControlRight']],
    cycle_spawn_up: [['ArrowUp']],
    cycle_spawn_down: [['ArrowDown']],
    delete_entity: [['Delete']],
    close_panel: [['Escape']],
    /* 箱庭：F 交互 / B 背包 / E 装备 / M 地图 */
    interact: [['KeyF']],
    open_inventory: [['KeyB']],
    open_equipment: [['KeyE']],
    open_map: [['KeyM']],
    save_world: [['ControlLeft', 'KeyS'], ['MetaLeft', 'KeyS']],
    load_world: [['ControlLeft', 'KeyO'], ['MetaLeft', 'KeyO']],
    /* 鼠标视角：左键拖拽旋转 / 右键拖拽平移（纯摄像机方案），均可在操作设置中修改 */
    mouse_orbit: [['Mouse0']],
    mouse_pan: [['Mouse2']],
    /* 生成物体：默认 Ctrl+左键（编辑模式），与左键选中/旋转视角以修饰键区分，可在操作设置中修改 */
    spawn_entity: [['ControlLeft', 'Mouse0'], ['ControlRight', 'Mouse0']],
    /* 锁定目标：默认中键（游玩模式） */
    lock_target: [['Mouse1']],
    /* 游玩模式攻击：轻击 = 左键松开，重击 = 右键松开，均可在操作设置中修改 */
    attack_light: [['Mouse0']],
    attack_heavy: [['Mouse2']],
    /* 展示模式聚焦：默认左键点击 */
    showcase_focus: [['Mouse0']],
}

/** 鼠标按键码前缀（Mouse0 = 左键 / Mouse1 = 中键 / Mouse2 = 右键，与 KeyboardEvent.code 共用同一绑定空间） */
export const MOUSE_CODE_PREFIX = 'Mouse'

/** MouseEvent.button → 统一绑定码 */
export const mouseCode = (button: number): string => `${MOUSE_CODE_PREFIX}${button}`

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

/** 鼠标按键码 → 本地化标签键（与 CODE_LABELS 分开，因为鼠标按键名需要翻译） */
export const MOUSE_CODE_LABELS: Record<string, StringLocaleKey> = {
    Mouse0: 'input.code.mouse_left',
    Mouse1: 'input.code.mouse_middle',
    Mouse2: 'input.code.mouse_right',
    Mouse3: 'input.code.mouse_side1',
    Mouse4: 'input.code.mouse_side2',
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
 * 在当前绑定中查找与给定 combo 冲突的**全部**条目。
 * 返回冲突动作列表（可能为空：不同模式下的鼠标动作默认共用同一按键，覆盖时需一并处理）。
 * excludeAction 用于排除正在编辑的动作本身。
 */
export const findConflicts = (
    bindings: { readonly [K in InputAction]: readonly (readonly string[])[] },
    combo: KeyCombo,
    excludeAction?: InputAction,
): InputAction[] => {
    const conflicts: InputAction[] = []
    for (const action of INPUT_ACTIONS) {
        if (action === excludeAction) continue
        const combos = bindings[action]
        for (const existing of combos) {
            if (combosEqual(existing, combo)) {
                conflicts.push(action)
                break
            }
        }
    }
    return conflicts
}

/** localStorage 键名 */
export const STORAGE_KEY = 'box_demo_keybindings'
