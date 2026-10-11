/**
 * 玩家 HUD — 左上角显示生命值、状态计时器、通用计时器行
 */
import {translate} from '../../i18n/index.ts'
import {localizeText} from '../../i18n/dom.ts'

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
    /** 当前武器名（HUD 装备行显示） */
    weaponLabel: string
    /** 当前持握模式中文名（单持 / 双手共持 / 双持） */
    holdModeLabel: string
    /** 远程蓄力值（0~1） */
    charge: number
    /** 是否正在蓄力（显示蓄力条） */
    charging: boolean
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

/** HUD 计时条填充色令牌（与主题色一致） */
const FILL_SUCCESS = 'var(--dc-success)'
const FILL_WARNING = 'var(--dc-warning)'
const FILL_DANGER = 'var(--dc-danger)'
const FILL_ORANGE = 'var(--dc-orange-bright)'

export const createPlayerHUD = (): PlayerHUD => {
    const el = document.createElement('div')
    el.id = 'player-hud'
    el.className = 'dc-panel dc-mono'
    el.style.cssText = [
        'position:fixed;top:16px;left:16px;',
        'padding:10px 14px;min-width:240px;',
        'pointer-events:none;z-index:100;',
        'display:none;',
    ].join(' ')

    const label = document.createElement('div')
    label.className = 'dc-hint'
    label.style.cssText = 'margin-bottom:2px'
    localizeText(label, 'play.hud.hp')
    el.appendChild(label)

    const barOuter = document.createElement('div')
    barOuter.className = 'dc-bar'
    barOuter.style.cssText = 'height:8px;margin:4px 0'
    const barInner = document.createElement('div')
    /* 宽度不加过渡（每帧重写，缓动会滞后）；背景色保留短过渡以平滑颜色切换 */
    barInner.className = 'dc-bar__fill'
    barInner.style.cssText = `height:100%;width:100%;background:${FILL_SUCCESS};transition:background .15s`
    barOuter.appendChild(barInner)
    el.appendChild(barOuter)

    const hpText = document.createElement('div')
    hpText.style.cssText = 'text-align:right;font-size:12px;margin-bottom:6px'
    el.appendChild(hpText)

    /* 蓄力条（仅蓄力时显示）：远程弓 / 投掷物的按住蓄力进度 */
    const chargeRow = document.createElement('div')
    chargeRow.style.cssText = 'display:none;margin-bottom:6px'
    const chargeLabel = document.createElement('div')
    chargeLabel.className = 'dc-hint'
    chargeLabel.style.cssText = 'margin-bottom:2px'
    chargeLabel.textContent = translate('play.hud.charge')
    const chargeBar = document.createElement('div')
    chargeBar.className = 'dc-bar'
    chargeBar.style.cssText = 'height:6px'
    const chargeFill = document.createElement('div')
    chargeFill.className = 'dc-bar__fill'
    chargeFill.style.cssText = `height:100%;width:0;background:${FILL_ORANGE}`
    chargeBar.appendChild(chargeFill)
    chargeRow.appendChild(chargeLabel)
    chargeRow.appendChild(chargeBar)
    el.appendChild(chargeRow)

    const separator = document.createElement('div')
    separator.className = 'dc-divider'
    separator.style.cssText = 'margin:4px 0'
    el.appendChild(separator)

    const stateEl = document.createElement('div')
    stateEl.style.cssText = 'font-size:12px'
    el.appendChild(stateEl)

    /* 装备行：当前武器 + 持握模式（Ctrl 切换） */
    const loadoutEl = document.createElement('div')
    loadoutEl.className = 'dc-dim'
    loadoutEl.style.cssText = 'font-size:12px'
    el.appendChild(loadoutEl)

    const timersTitle = document.createElement('div')
    timersTitle.className = 'dc-hint'
    timersTitle.style.cssText = 'margin-top:4px'
    localizeText(timersTitle, 'play.hud.timers')
    el.appendChild(timersTitle)

    const timersList = document.createElement('div')
    timersList.style.cssText = 'font-size:11px'
    el.appendChild(timersList)

    const skillsTitle = document.createElement('div')
    skillsTitle.className = 'dc-hint'
    skillsTitle.style.cssText = 'margin-top:6px'
    localizeText(skillsTitle, 'play.hud.skills')
    el.appendChild(skillsTitle)

    /* 列头：动作 / 恢复 / 冷却 */
    const skillsHeader = document.createElement('div')
    skillsHeader.className = 'dc-mute'
    skillsHeader.style.cssText = 'display:flex;gap:4px;font-size:9px;margin-top:2px'
    const headerSpacer = document.createElement('span')
    headerSpacer.style.cssText = 'min-width:56px'
    skillsHeader.appendChild(headerSpacer)
    for (const key of ['play.hud.col.action', 'play.hud.col.recovery', 'play.hud.col.cooldown'] as const) {
        const span = document.createElement('span')
        span.style.cssText = 'flex:1;text-align:center'
        localizeText(span, key)
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
            row.className = 'dc-row'
            row.style.cssText = 'gap:4px;margin-top:1px'
            const lbl = document.createElement('span')
            lbl.className = 'dc-dim'
            lbl.style.cssText = 'min-width:36px'
            const bar = document.createElement('div')
            bar.className = 'dc-bar'
            bar.style.cssText = 'height:4px;flex:1'
            const fill = document.createElement('div')
            /* 不加 CSS 过渡：每帧重写 width，逐帧更新本身即平滑（同技能单元格） */
            fill.className = 'dc-bar__fill'
            fill.style.cssText = 'height:100%;width:100%'
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
        bar.className = 'dc-bar'
        bar.style.cssText = 'height:4px'
        const fill = document.createElement('div')
        /* 不加 CSS 过渡：HUD 每帧重写 width，缓动会导致显示值滞后真实值（起止两端差一），逐帧更新本身即平滑 */
        fill.className = 'dc-bar__fill'
        fill.style.cssText = 'height:100%;width:100%'
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
            row.className = 'dc-row'
            row.style.cssText = 'gap:4px;margin-top:3px'
            const lbl = document.createElement('span')
            lbl.className = 'dc-dim'
            lbl.style.cssText = 'min-width:56px;font-size:10px'
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
        if (pct > 0.5) barInner.style.background = FILL_SUCCESS
        else if (pct > 0.25) barInner.style.background = FILL_WARNING
        else barInner.style.background = FILL_DANGER
        hpText.textContent = `${data.health} / ${data.maxHealth}`

        stateEl.textContent = translate({key: 'play.hud.state', args: [data.stateName, data.stateTime.toFixed(2)]})
        loadoutEl.textContent = translate({key: 'play.hud.loadout', args: [data.weaponLabel, data.holdModeLabel]})

        chargeRow.style.display = data.charging ? '' : 'none'
        if (data.charging) {
            const ratio = Math.max(0, Math.min(1, data.charge))
            chargeFill.style.width = `${ratio * 100}%`
            chargeFill.style.background = ratio >= 1 ? FILL_DANGER : FILL_ORANGE
            chargeLabel.textContent = translate({key: 'play.hud.charge_pct', args: [String(Math.round(ratio * 100))]})
        }

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
