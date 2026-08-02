/**
 * 设置面板（右上角齿轮按钮）。
 * 提供回到主页面、查看操作说明、配置按键的入口。
 */
export const setupSettingsPanel = (
    toggleInstructions: () => void,
    toggleBindings: () => void,
): void => {
    const btn = document.createElement('button')
    btn.style.cssText = [
        'position:fixed;top:16px;right:16px;z-index:200',
        'width:40px;height:40px',
        'border:1px solid #555;background:#111;color:#fff',
        'font-size:20px;cursor:pointer',
        'display:flex;align-items:center;justify-content:center',
    ].join(';')
    btn.title = '设置'
    btn.textContent = '⚙'
    btn.addEventListener('mouseenter', () => { btn.style.background = '#222' })
    btn.addEventListener('mouseleave', () => { btn.style.background = '#111' })
    document.body.appendChild(btn)

    const menu = document.createElement('div')
    menu.style.cssText = [
        'position:fixed;top:64px;right:16px;z-index:200',
        'display:none;min-width:180px',
        'background:#111;border:1px solid #333',
        'padding:4px 0',
    ].join(';')
    document.body.appendChild(menu)

    const ITEM_CSS = 'padding:10px 18px;font:14px/1.5 system-ui,sans-serif;color:#ccc;cursor:pointer'
    const ITEM_HOVER_BG = '#222'

    const createItem = (text: string, onClick: () => void): HTMLElement => {
        const el = document.createElement('div')
        el.style.cssText = ITEM_CSS
        el.textContent = text
        el.addEventListener('mouseenter', () => { el.style.background = ITEM_HOVER_BG })
        el.addEventListener('mouseleave', () => { el.style.background = '' })
        el.addEventListener('click', onClick)
        return el
    }

    let open = false

    menu.appendChild(createItem('🏠 返回主页面', () => {
        close()
        window.location.reload()
    }))

    menu.appendChild(createItem('❓ 操作说明', () => {
        close()
        toggleInstructions()
    }))

    menu.appendChild(createItem('🎮 按键配置', () => {
        close()
        toggleBindings()
    }))

    const close = (): void => {
        open = false
        menu.style.display = 'none'
    }

    btn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation()
        open = !open
        menu.style.display = open ? 'block' : 'none'
    })

    document.addEventListener('click', (e: MouseEvent) => {
        if (open && !menu.contains(e.target as Node) && e.target !== btn) {
            close()
        }
    })
}
