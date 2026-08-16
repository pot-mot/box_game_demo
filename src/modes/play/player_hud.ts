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

/** 计时器单元格 — 技能行中动作/恢复/冷却三者之一 */
export interface TimerCellData {
    /** 0~1 进度条填充比例 */
    fillRatio: number
    fillColor: string
    text: string
}

/** 技能计时器行 — 单个技能槽的动作/恢复/冷却三个计时器同行展示 */
export interface SkillTimerRowData {
    label: string
    /** 动作时间计时（config.duration） */
    action: TimerCellData
    /** 恢复时间计时（config.recovery） */
    recovery: TimerCellData
    /** 冷却时间计时（config.cooldown，触发时开始） */
    cooldown: TimerCellData
}

export interface PlayerHUDData {
    health: number
    maxHealth: number
    stateName: string
    stateTime: number
    timers: ReadonlyArray<TimerRowData>
    skillTimers: ReadonlyArray<SkillTimerRowData>
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

interface TimerCell {
    /** 单元格根容器（flex:1，挂到技能行） */
    root: HTMLDivElement
    fill: HTMLElement
    text: HTMLElement
}

interface SkillTimerRow {
    row: HTMLDivElement
    label: HTMLElement
    action: TimerCell
    recovery: TimerCell
    cooldown: TimerCell
}

export const createPlayerHUD = (): PlayerHUD => {
    const el = document.createElement('div')
    el.id = 'player-hud'
    el.style.cssText = [
        'position:fixed;top:16px;left:16px;',
        'background:rgba(0,0,0,.6);color:#fff;',
        'font:13px/1.6 monospace;padding:10px 14px;',
        'border-radius:8px;min-width:240px;',
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
    /* 宽度不加过渡（每帧重写，缓动会滞后）；背景色保留短过渡以平滑颜色切换 */
    barInner.style.cssText = 'height:100%;width:100%;background:#44ff44;border-radius:4px;transition:background .15s'
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

    const skillsTitle = document.createElement('div')
    skillsTitle.style.cssText = 'font-size:11px;opacity:.7;margin-top:6px'
    skillsTitle.textContent = 'SKILLS'
    el.appendChild(skillsTitle)

    /* 列头：动作 / 恢复 / 冷却 */
    const skillsHeader = document.createElement('div')
    skillsHeader.style.cssText = 'display:flex;gap:4px;font-size:9px;opacity:.55;margin-top:2px'
    const headerSpacer = document.createElement('span')
    headerSpacer.style.cssText = 'min-width:56px'
    skillsHeader.appendChild(headerSpacer)
    for (const h of ['动作', '恢复', '冷却']) {
        const span = document.createElement('span')
        span.style.cssText = 'flex:1;text-align:center'
        span.textContent = h
        skillsHeader.appendChild(span)
    }
    el.appendChild(skillsHeader)

    const skillsList = document.createElement('div')
    skillsList.style.cssText = 'font-size:11px'
    el.appendChild(skillsList)

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
            /* 不加 CSS 过渡：每帧重写 width，逐帧更新本身即平滑（同技能单元格） */
            fill.style.cssText = 'height:100%;width:100%;border-radius:2px'
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

    let skillRows: SkillTimerRow[] = []

    /** 创建单个计时器单元格（迷你进度条 + 下方文本） */
    const makeCell = (): TimerCell => {
        const cell = document.createElement('div')
        cell.style.cssText = 'flex:1;min-width:0'
        const bar = document.createElement('div')
        bar.style.cssText = 'height:4px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden'
        const fill = document.createElement('div')
        /* 不加 CSS 过渡：HUD 每帧重写 width，缓动会导致显示值滞后真实值（起止两端差一），逐帧更新本身即平滑 */
        fill.style.cssText = 'height:100%;width:100%;border-radius:2px'
        bar.appendChild(fill)
        const txt = document.createElement('div')
        txt.style.cssText = 'font-size:9px;text-align:center;opacity:.85'
        cell.appendChild(bar)
        cell.appendChild(txt)
        return {root: cell, fill, text: txt}
    }

    const ensureSkillRows = (count: number): void => {
        while (skillRows.length < count) {
            const row = document.createElement('div')
            row.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:3px'
            const lbl = document.createElement('span')
            lbl.style.cssText = 'opacity:.7;min-width:56px;font-size:10px'
            row.appendChild(lbl)
            const action = makeCell()
            const recovery = makeCell()
            const cooldown = makeCell()
            row.appendChild(action.root)
            row.appendChild(recovery.root)
            row.appendChild(cooldown.root)
            skillsList.appendChild(row)
            skillRows.push({row, label: lbl, action, recovery, cooldown})
        }
        while (skillRows.length > count) {
            const removed = skillRows.pop()
            if (removed) removed.row.remove()
        }
    }

    const applyCell = (cell: TimerCell, data: TimerCellData): void => {
        cell.fill.style.width = `${Math.max(0, Math.min(1, data.fillRatio)) * 100}%`
        cell.fill.style.background = data.fillColor
        cell.text.textContent = data.text
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

        const skillCount = data.skillTimers.length
        ensureSkillRows(skillCount)
        for (let i = 0; i < skillCount; i++) {
            const s = data.skillTimers[i]
            const r = skillRows[i]
            r.label.textContent = s.label
            applyCell(r.action, s.action)
            applyCell(r.recovery, s.recovery)
            applyCell(r.cooldown, s.cooldown)
        }
    }

    const setVisible = (visible: boolean): void => {
        el.style.display = visible ? '' : 'none'
    }

    const destroy = (): void => { el.remove() }

    return {update, setVisible, destroy}
}
