/**
 * 死亡重启弹窗
 */
import {localizeText} from '../../i18n/dom.ts'

export interface DeathScreen {
    show: () => void
    destroy: () => void
}

export const createDeathScreen = (onRestart: () => void, onBackToMenu: () => void): DeathScreen => {
    const overlay = document.createElement('div')
    overlay.className = 'dc-overlay'
    overlay.style.cssText = 'flex-direction:column;z-index:200;pointer-events:all'

    const msg = document.createElement('div')
    localizeText(msg, 'play.death.title')
    msg.className = 'dc-title dc-text-danger'
    msg.style.cssText = 'font-size:48px;font-weight:700;margin-bottom:32px'
    overlay.appendChild(msg)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:16px'

    const restartBtn = document.createElement('button')
    restartBtn.className = 'dc-btn dc-btn--lg dc-btn--primary'
    localizeText(restartBtn, 'play.death.restart')
    restartBtn.onclick = () => { destroy(); onRestart() }
    btnRow.appendChild(restartBtn)

    const menuBtn = document.createElement('button')
    menuBtn.className = 'dc-btn dc-btn--lg'
    localizeText(menuBtn, 'play.death.menu')
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
