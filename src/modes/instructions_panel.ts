import type {GameMode} from './constants.ts'

const EDIT_INSTRUCTIONS = [
    '鼠标左键拖拽 旋转视角',
    'W A S D    移动视角',
    'E / Q     上升 / 下降',
    '鼠标左键点击 选中物体',
    '鼠标右键   生成物体',
    '滚轮     雕刻地形',
    '↑ / ↓    切换生成类型',
    'Delete    删除选中',
    'F1      切换帮助',
    'Ctrl+S    导出存档',
    'Ctrl+O    导入存档',
]

const PLAY_INSTRUCTIONS = [
    'W A S D    移动角色',
    'Space     跳跃',
    '鼠标左键拖拽 旋转视角',
    '滚轮     缩放距离',
    'F1      切换帮助',
    'Ctrl+S    导出存档',
    'Ctrl+O    导入存档',
]

/** 创建可切换的操作说明面板，按 F1 切换可见性 */
export const setupInstructionsPanel = (getMode: () => GameMode): {
    updater: () => void
    toggle: () => void
} => {
    const panel = document.createElement('div')
    panel.id = 'instructions-panel'
    document.body.appendChild(panel)

    const title = document.createElement('div')
    title.id = 'instructions-title'
    panel.appendChild(title)

    const list = document.createElement('div')
    list.id = 'instructions-list'
    panel.appendChild(list)

    let visible = false

    const buildContent = (): void => {
        const mode = getMode()
        const items = mode === 'edit' ? EDIT_INSTRUCTIONS : PLAY_INSTRUCTIONS
        title.textContent = mode === 'edit' ? '=== 编辑模式操作说明 ===' : '=== 游玩模式操作说明 ==='

        list.innerHTML = ''
        for (const text of items) {
            const div = document.createElement('div')
            div.className = 'instruction-line'
            div.textContent = text
            list.appendChild(div)
        }
    }

    const toggle = (): void => {
        visible = !visible
        if (visible) buildContent()
        panel.style.display = visible ? 'block' : 'none'
    }

    panel.style.display = 'none'

    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code === 'F1') {
            e.preventDefault()
            toggle()
        }
    })

    const updater = (): void => {
        if (visible) buildContent()
    }

    return {updater, toggle}
}
