import type {PanelContext} from '../../ui'
import type {DestructionEntityContext} from '../types'

export const createDestructionPanel = (ctx: DestructionEntityContext): PanelContext => {
    const el = document.createElement('div')
    el.id = 'destruction-box-panel'
    el.style.cssText = [
        'position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);',
        'background: rgba(0,0,0,.75); color: #fff;',
        'font: 13px/1.5 monospace; padding: 12px 20px;',
        'border-radius: 10px; min-width: 280px;',
        'user-select: none; display: none;',
        'text-align: center;',
    ].join(' ')

    const header = document.createElement('div')
    header.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:14px;color:#ff6b6b'
    header.textContent = 'Destructible Box'
    el.appendChild(header)

    const healthLabel = document.createElement('div')
    el.appendChild(healthLabel)

    const crackLabel = document.createElement('div')
    crackLabel.style.cssText = 'color:#aaa;margin-top:4px'
    el.appendChild(crackLabel)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;justify-content:center'

    const deleteBtn = document.createElement('button')
    deleteBtn.textContent = 'Delete'
    btnRow.appendChild(deleteBtn)
    el.appendChild(btnRow)

    return {
        render: (container: HTMLElement) => {
            const sel = ctx.getSelected()
            if (!sel) return
            container.appendChild(el)
            el.style.display = 'block'
            const ratio = Math.max(0, sel.health / sel.config.maxHealth)
            const pct = (ratio * 100).toFixed(0)
            healthLabel.textContent = `Health: ${'|'.repeat(Math.max(1, Math.round(ratio * 10)))}${'.'.repeat(Math.max(0, 10 - Math.round(ratio * 10)))} ${pct}%`
            healthLabel.style.color = ratio > 0.5 ? '#6b6' : ratio > 0.25 ? '#cc6' : '#f66'
            crackLabel.textContent = `Cracks: ${ratio < 0.25 ? 'Severe' : ratio < 0.5 ? 'Moderate' : ratio < 0.75 ? 'Light' : 'None'}`
            deleteBtn.onclick = () => {
                ctx.remove(sel.id)
            }
        },
        destroy: () => {
            el.remove()
        },
    }
}
