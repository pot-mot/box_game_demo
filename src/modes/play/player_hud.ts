/**
 * 玩家 HUD — 左上角显示生命值、状态计时器、通用计时器行
 */

/** 通用计时器行数据 */
export interface TimerRowData {
    label: string
    /** 0~1 进度条填充比例 */
    fillRatio: number
    fillColor: string
    text: string
    visible: boolean
}

export interface PlayerHUDData {
    health: number
    maxHealth: number
    stateName: string
    stateTime: number
    timers: ReadonlyArray<TimerRowData>
}

export interface PlayerHUD {
    update: (data: PlayerHUDData) => void
    setVisible: (visible: boolean) => void
    destroy: () => void
}

interface TimerRow {
    row: HTMLDivElement
    label: HTMLElement
    fill: HTMLElement
    text: HTMLElement
}

export const createPlayerHUD = (): PlayerHUD => {
    const el = document.createElement('div')
    el.id = 'player-hud'
    el.style.cssText = [
        'position:fixed;top:16px;left:16px;',
        'background:rgba(0,0,0,.6);color:#fff;',
        'font:13px/1.6 monospace;padding:10px 14px;',
        'border-radius:8px;min-width:200px;',
        'pointer-events:none;z-index:100;',
        'display:none;',
    ].join(' ')

    const label = document.createElement('div')
    label.style.cssText = 'font-size:11px;opacity:.7;margin-bottom:2px'
    label.textContent = 'PLAYER HP'
    el.appendChild(label)

    const barOuter = document.createElement('div')
    barOuter.style.cssText = 'height:8px;background:rgba(255,255,255,.15);border-radius:4px;margin:4px 0;overflow:hidden'
    const barInner = document.createElement('div')
    barInner.style.cssText = 'height:100%;width:100%;background:#44ff44;border-radius:4px;transition:width .15s,background .15s'
    barOuter.appendChild(barInner)
    el.appendChild(barOuter)

    const hpText = document.createElement('div')
    hpText.style.cssText = 'text-align:right;font-size:12px;margin-bottom:6px'
    el.appendChild(hpText)

    const separator = document.createElement('div')
    separator.style.cssText = 'border-top:1px solid rgba(255,255,255,.15);margin:4px 0'
    el.appendChild(separator)

    const stateEl = document.createElement('div')
    stateEl.style.cssText = 'font-size:12px'
    el.appendChild(stateEl)

    const timersTitle = document.createElement('div')
    timersTitle.style.cssText = 'font-size:11px;opacity:.7;margin-top:4px'
    timersTitle.textContent = 'TIMERS'
    el.appendChild(timersTitle)

    const timersList = document.createElement('div')
    timersList.style.cssText = 'font-size:11px'
    el.appendChild(timersList)

    document.body.appendChild(el)

    let timerRows: TimerRow[] = []

    const ensureTimerRows = (count: number): void => {
        while (timerRows.length < count) {
            const row = document.createElement('div')
            row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:1px'
            const lbl = document.createElement('span')
            lbl.style.cssText = 'opacity:.7;min-width:36px'
            const bar = document.createElement('div')
            bar.style.cssText = 'height:4px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden;flex:1'
            const fill = document.createElement('div')
            fill.style.cssText = 'height:100%;width:100%;border-radius:2px;transition:width .15s'
            bar.appendChild(fill)
            const txt = document.createElement('span')
            txt.style.cssText = 'min-width:64px;text-align:right'
            row.appendChild(lbl)
            row.appendChild(bar)
            row.appendChild(txt)
            timersList.appendChild(row)
            timerRows.push({row, label: lbl, fill, text: txt})
        }
        while (timerRows.length > count) {
            const removed = timerRows.pop()
            if (removed) removed.row.remove()
        }
    }

    const update = (data: PlayerHUDData): void => {
        const pct = Math.max(0, Math.min(1, data.health / data.maxHealth))
        barInner.style.width = `${pct * 100}%`
        if (pct > 0.5) barInner.style.background = '#44ff44'
        else if (pct > 0.25) barInner.style.background = '#ffaa00'
        else barInner.style.background = '#ff4444'
        hpText.textContent = `${data.health} / ${data.maxHealth}`

        stateEl.textContent = `ST: ${data.stateName}  ${data.stateTime.toFixed(2)}s`

        const count = data.timers.length
        ensureTimerRows(count)
        for (let i = 0; i < count; i++) {
            const t = data.timers[i]
            const r = timerRows[i]
            r.label.textContent = t.label
            r.fill.style.width = `${t.fillRatio * 100}%`
            r.fill.style.background = t.fillColor
            r.text.textContent = t.text
            r.row.style.display = t.visible ? '' : 'none'
        }
    }

    const setVisible = (visible: boolean): void => {
        el.style.display = visible ? '' : 'none'
    }

    const destroy = (): void => { el.remove() }

    return {update, setVisible, destroy}
}
