/**
 * 设置面板（右上角齿轮按钮）。
 * 提供回到主页面和查看操作说明的入口。
 */
export const setupSettingsPanel = (toggleInstructions: () => void): void => {
    const btn = document.createElement('button')
    btn.id = 'settings-btn'
    btn.textContent = '⚙'
    btn.title = '设置'
    document.body.appendChild(btn)

    const menu = document.createElement('div')
    menu.id = 'settings-menu'
    document.body.appendChild(menu)

    let open = false

    const homeItem = document.createElement('div')
    homeItem.className = 'settings-menu-item'
    homeItem.textContent = '🏠 返回主页面'
    menu.appendChild(homeItem)

    const instrItem = document.createElement('div')
    instrItem.className = 'settings-menu-item'
    instrItem.textContent = '❓ 操作说明'
    menu.appendChild(instrItem)

    const close = (): void => {
        open = false
        menu.style.display = 'none'
    }

    btn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation()
        open = !open
        menu.style.display = open ? 'block' : 'none'
    })

    homeItem.addEventListener('click', () => {
        close()
        // 重新加载页面以回到启动界面
        window.location.reload()
    })

    instrItem.addEventListener('click', () => {
        close()
        toggleInstructions()
    })

    document.addEventListener('click', (e: MouseEvent) => {
        if (open && !menu.contains(e.target as Node) && e.target !== btn) {
            close()
        }
    })
}
