/**
 * 玩家血量 HUD — 左上角显示当前生命值
 */
export interface PlayerHUD {
    update: (health: number, maxHealth: number) => void
    destroy: () => void
}

export const createPlayerHUD = (): PlayerHUD => {
    const el = document.createElement('div')
    el.id = 'player-hud'
    el.style.cssText = [
        'position:fixed;top:16px;left:16px;',
        'background:rgba(0,0,0,.6);color:#fff;',
        'font:15px/1.5 monospace;padding:10px 16px;',
        'border-radius:8px;min-width:180px;',
        'pointer-events:none;z-index:100;',
    ].join(' ')

    const label = document.createElement('div')
    label.style.cssText = 'font-size:11px;opacity:.7'
    label.textContent = 'PLAYER HP'
    el.appendChild(label)

    const barOuter = document.createElement('div')
    barOuter.style.cssText = 'height:10px;background:rgba(255,255,255,.15);border-radius:5px;margin:4px 0;overflow:hidden'
    const barInner = document.createElement('div')
    barInner.style.cssText = 'height:100%;width:100%;background:#44ff44;border-radius:5px;transition:width .15s,background .15s'
    barOuter.appendChild(barInner)
    el.appendChild(barOuter)

    const text = document.createElement('div')
    text.style.cssText = 'text-align:right;font-size:12px'
    el.appendChild(text)

    document.body.appendChild(el)

    const update = (health: number, maxHealth: number): void => {
        const pct = Math.max(0, Math.min(1, health / maxHealth))
        barInner.style.width = `${pct * 100}%`
        if (pct > 0.5) barInner.style.background = '#44ff44'
        else if (pct > 0.25) barInner.style.background = '#ffaa00'
        else barInner.style.background = '#ff4444'
        text.textContent = `${health} / ${maxHealth}`
    }

    const destroy = (): void => { el.remove() }

    return {update, destroy}
}
