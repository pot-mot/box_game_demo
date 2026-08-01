/**
 * 死亡重启弹窗
 */
export interface DeathScreen {
    show: () => void
    destroy: () => void
}

export const createDeathScreen = (onRestart: () => void, onBackToMenu: () => void): DeathScreen => {
    const overlay = document.createElement('div')
    overlay.style.cssText = [
        'position:fixed;inset:0;',
        'background:rgba(0,0,0,.7);color:#fff;',
        'display:flex;flex-direction:column;align-items:center;justify-content:center;',
        'font:16px/1.5 monospace;z-index:200;',
        'pointer-events:all;',
    ].join(' ')

    const msg = document.createElement('div')
    msg.textContent = 'YOU DIED'
    msg.style.cssText = 'font-size:48px;font-weight:700;margin-bottom:32px;color:#ff4444'
    overlay.appendChild(msg)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:16px'

    const restartBtn = document.createElement('button')
    restartBtn.textContent = '重新开始'
    restartBtn.style.cssText = 'padding:12px 32px;font:16px monospace;border:none;border-radius:6px;cursor:pointer;background:#44aa44;color:#fff'
    restartBtn.onclick = () => { destroy(); onRestart() }
    btnRow.appendChild(restartBtn)

    const menuBtn = document.createElement('button')
    menuBtn.textContent = '返回菜单'
    menuBtn.style.cssText = 'padding:12px 32px;font:16px monospace;border:none;border-radius:6px;cursor:pointer;background:#555;color:#fff'
    menuBtn.onclick = () => { destroy(); onBackToMenu() }
    btnRow.appendChild(menuBtn)

    overlay.appendChild(btnRow)

    let mounted = false

    const show = (): void => {
        if (mounted) return
        document.body.appendChild(overlay)
        mounted = true
    }

    const destroy = (): void => {
        if (!mounted) return
        overlay.remove()
        mounted = false
    }

    return {show, destroy}
}
