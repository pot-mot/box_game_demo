import type {CharacterDebugView} from '../../character/debug_views.ts'
import {CHARACTER_DEBUG_VIEWS} from '../../character/debug_views.ts'
import type {StringLocaleKey} from '../../i18n/index.ts'
import {localizeText} from '../../i18n/dom.ts'

/** 可独立控制调试可视化的最小角色系统接口 */
export interface EditDebugViewSource {
    readonly setDebugVisible: (view: CharacterDebugView, visible: boolean) => void
}

const DEBUG_LABEL_KEYS: Record<CharacterDebugView, StringLocaleKey> = {
    collision: 'edit.debug.collision',
    attack: 'edit.debug.attack',
    hurt: 'edit.debug.hurt',
    detect: 'edit.debug.detect',
    vision: 'edit.debug.vision',
}

/**
 * 编辑模式「显示控制」小面板：位于实体列表上方，各类角色调试可视化各自独立勾选。
 * 默认全部关闭；勾选后对全部角色常态显示，且不再由选中状态绕过开关。
 */
export const setupEditDebugPanel = (source: EditDebugViewSource): HTMLElement => {
    const el = document.createElement('div')
    el.id = 'edit-debug-panel'
    el.className = 'dc-panel'
    el.style.cssText = 'position:fixed;top:120px;left:16px;padding:8px 12px;min-width:360px;user-select:none;'
    document.body.appendChild(el)

    const title = document.createElement('div')
    title.className = 'dc-panel__title'
    localizeText(title, 'edit.debug.title')
    el.appendChild(title)

    const grid = document.createElement('div')
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3, 1fr);gap:4px 12px;margin-top:4px'
    el.appendChild(grid)

    for (const view of CHARACTER_DEBUG_VIEWS) {
        const label = document.createElement('label')
        label.className = 'dc-label'
        label.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer'

        const input = document.createElement('input')
        input.type = 'checkbox'
        input.className = 'dc-check'
        input.id = `edit-debug-${view}`
        input.checked = false
        input.addEventListener('change', () => source.setDebugVisible(view, input.checked))

        const text = document.createElement('span')
        localizeText(text, DEBUG_LABEL_KEYS[view])

        label.appendChild(input)
        label.appendChild(text)
        grid.appendChild(label)
        source.setDebugVisible(view, false)
    }

    return el
}
