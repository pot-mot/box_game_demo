import type {GameMode} from './constants.ts'
import {getInputRegistry} from '../input/registry.ts'
import {ACTION_LABELS, EDIT_ONLY_ACTIONS, type InputAction} from '../input/types.ts'
import {keyComboToDisplay} from '../input/display.ts'

const PANEL_CSS = [
    'position:fixed',
    'top:50%;left:50%;transform:translate(-50%,-50%)',
    'z-index:999',
    'background:#111;border:1px solid #333',
    'padding:28px 36px;min-width:360px',
    'pointer-events:none',
].join(';')

const TITLE_CSS = [
    'font:600 18px/1.8 system-ui,sans-serif',
    'color:#fff;text-align:center',
    'margin-bottom:12px;border-bottom:1px solid #333',
    'padding-bottom:8px',
].join(';')

const LIST_CSS = 'display:flex;flex-direction:column;gap:4px'

const LINE_CSS = 'font:14px/1.8 system-ui,sans-serif;color:#ccc'

/** 鼠标操作说明（不可重绑，静态） */
const MOUSE_INSTRUCTIONS_EDIT = [
    '鼠标左键拖拽 旋转视角',
    '鼠标左键点击 选中物体',
    '鼠标右键   生成物体',
    '滚轮     雕刻地形',
]

const MOUSE_INSTRUCTIONS_PLAY = [
    '鼠标左键拖拽 旋转视角',
    '鼠标左键点击 轻攻击',
    '鼠标右键   重攻击',
    '滚轮     缩放距离',
]

/** 在说明面板中需要显示的键盘动作顺序 */
const INSTRUCTION_ORDER: readonly InputAction[] = [
    'move_forward', 'move_backward', 'move_left', 'move_right',
    'move_up', 'move_down',
    'jump', 'sprint',
    'cycle_spawn_up', 'cycle_spawn_down',
    'delete_entity', 'close_panel',
    'toggle_help',
    'save_world', 'load_world',
]

/** 创建可切换的操作说明面板 */
export const setupInstructionsPanel = (getMode: () => GameMode): {
    updater: () => void
    toggle: () => void
} => {
    const input = getInputRegistry()

    const panel = document.createElement('div')
    panel.style.cssText = PANEL_CSS
    document.body.appendChild(panel)

    const title = document.createElement('div')
    title.style.cssText = TITLE_CSS
    panel.appendChild(title)

    const list = document.createElement('div')
    list.style.cssText = LIST_CSS
    panel.appendChild(list)

    let visible = false

    const buildContent = (): void => {
        const mode = getMode()
        const bindings = input.getBindings()
        title.textContent = mode === 'edit' ? '=== 编辑模式操作说明 ===' : '=== 游玩模式操作说明 ==='

        list.innerHTML = ''

        /* 鼠标操作（静态） */
        const mouseItems = mode === 'edit' ? MOUSE_INSTRUCTIONS_EDIT : MOUSE_INSTRUCTIONS_PLAY
        for (const text of mouseItems) {
            const div = document.createElement('div')
            div.style.cssText = LINE_CSS
            div.textContent = text
            list.appendChild(div)
        }

        /* 键盘操作（从注册表动态生成） */
        for (const action of INSTRUCTION_ORDER) {
            /* 编辑模式专用动作在游玩模式中隐藏 */
            if (mode === 'play' && EDIT_ONLY_ACTIONS.has(action)) continue

            const combos = bindings[action]
            if (!combos || combos.length === 0) continue
            const keyStr = combos.map(keyComboToDisplay).join(' / ')
            const div = document.createElement('div')
            div.style.cssText = LINE_CSS
            div.textContent = `${keyStr} \u3000\u3000${ACTION_LABELS[action]}`
            list.appendChild(div)
        }
    }

    const toggle = (): void => {
        visible = !visible
        if (visible) buildContent()
        panel.style.display = visible ? 'block' : 'none'
    }

    panel.style.display = 'none'

    input.onActionDown('toggle_help', toggle)

    /* 更新仅在面板可见时重新生成内容（反映最新绑定） */
    const updater = (): void => {
        if (visible) buildContent()
    }

    return {updater, toggle}
}
